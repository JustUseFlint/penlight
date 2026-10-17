import type { LlmConfig } from './config';

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

export class LlmError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new LlmError(`LLM request failed (${res.status}): ${text.slice(0, 300)}`, res.status);
    try { return JSON.parse(text); } catch { throw new LlmError('LLM returned a non-JSON response.'); }
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if ((e as Error).name === 'AbortError') throw new LlmError('The AI provider timed out.');
    throw new LlmError(`Could not reach the AI provider: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

/** One chat completion. Works for OpenAI-compatible endpoints (xAI, OpenAI, local servers) and Anthropic. */
export async function chat(cfg: LlmConfig, messages: ChatMsg[], opts: { json?: boolean; maxTokens?: number; timeoutMs?: number } = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  if (cfg.style === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const data = await post(`${cfg.baseUrl}/v1/messages`, { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, { model: cfg.model, max_tokens: opts.maxTokens ?? 8000, system, messages: rest, temperature: 0.3 }, timeoutMs);
    const text = (data.content || []).map((c: { text?: string }) => c.text || '').join('');
    if (!text) throw new LlmError('The AI provider returned an empty response.');
    return text;
  }
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: 0.3 };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.json) body.response_format = { type: 'json_object' };
  let data;
  try {
    data = await post(`${cfg.baseUrl}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` }, body, timeoutMs);
  } catch (e) {
    // some compatible servers reject response_format; retry once without it
    if (opts.json && e instanceof LlmError && e.status === 400) {
      delete body.response_format;
      data = await post(`${cfg.baseUrl}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` }, body, timeoutMs);
    } else throw e;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new LlmError('The AI provider returned an empty response.');
  return text;
}

/** Extracts the first JSON object from a model reply (handles ``` fences and chatter). */
export function extractJson<T = unknown>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last < first) throw new LlmError('The AI reply did not contain JSON.');
  s = s.slice(first, last + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    // trim trailing commas
    return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) as T;
  }
}

export async function testConnection(cfg: LlmConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const t = await chat(cfg, [{ role: 'user', content: 'Reply with exactly: OK' }], { maxTokens: 16, timeoutMs: 30_000 });
    return { ok: true, message: `Connected. Model replied: “${t.trim().slice(0, 40)}”.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
