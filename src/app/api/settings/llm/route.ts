import { route, body } from '@/lib/api';
import { clearLlmConfig, PROVIDERS, publicLlmStatus, saveLlmConfig, type ProviderId } from '@/lib/llm/config';
import { setSetting } from '@/lib/db';

export const GET = route(async () => ({ status: publicLlmStatus(), providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, baseUrl: p.baseUrl, model: p.model })) }));
export const PUT = route(async ({ req }) => {
  const b = await body<{ provider: ProviderId; apiKey?: string; model?: string; baseUrl?: string; mode?: 'auto' | 'lite' }>(req);
  if (!b.provider || !(b.provider in PROVIDERS)) throw new Error('Pick a provider.');
  if (b.provider === 'custom' && !b.baseUrl?.trim()) throw new Error('Enter the base URL of your OpenAI-compatible API.');
  if (b.baseUrl && !/^https?:\/\//i.test(b.baseUrl)) throw new Error('The base URL must start with http:// or https://');
  saveLlmConfig({ provider: b.provider, apiKey: b.apiKey?.trim() || undefined, model: b.model, baseUrl: b.baseUrl });
  if (b.mode) setSetting('ai_mode_pref', b.mode);
  return { status: publicLlmStatus() };
});
export const DELETE = route(async () => { clearLlmConfig(); return { status: publicLlmStatus() }; });
