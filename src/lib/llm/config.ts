import { delSetting, getSetting, setSetting } from '../db';
import { decryptSecret, encryptSecret } from '../auth';

export type ProviderId = 'xai' | 'openai' | 'anthropic' | 'custom';

export const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string; style: 'openai' | 'anthropic' }> = {
  xai: { label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', model: 'grok-4', style: 'openai' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', style: 'openai' },
  anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', style: 'anthropic' },
  custom: { label: 'Custom OpenAI-compatible', baseUrl: '', model: '', style: 'openai' },
};

export interface LlmConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  style: 'openai' | 'anthropic';
  source: 'settings' | 'env';
}

/** Resolve the active config: values saved in Settings win over environment variables. */
export function getLlmConfig(): LlmConfig | null {
  let provider = (getSetting('llm_provider') as ProviderId | undefined) || undefined;
  let apiKey: string | undefined;
  let source: 'settings' | 'env' = 'settings';
  const enc = getSetting('llm_key_enc');
  if (enc) {
    try { apiKey = decryptSecret(enc); } catch { apiKey = undefined; }
  }
  if (!apiKey && process.env.LLM_API_KEY) {
    apiKey = process.env.LLM_API_KEY;
    source = 'env';
    provider = provider || ((process.env.LLM_PROVIDER as ProviderId) || 'xai');
  }
  if (!apiKey) return null;
  provider = provider && PROVIDERS[provider] ? provider : 'xai';
  const preset = PROVIDERS[provider];
  const model = (source === 'settings' ? getSetting('llm_model') : process.env.LLM_MODEL) || process.env.LLM_MODEL || preset.model;
  const baseUrl = ((source === 'settings' ? getSetting('llm_base_url') : process.env.LLM_BASE_URL) || process.env.LLM_BASE_URL || preset.baseUrl).replace(/\/+$/, '');
  if (!baseUrl || !model) return null;
  return { provider, apiKey, model, baseUrl, style: preset.style, source };
}

export function saveLlmConfig(p: { provider: ProviderId; apiKey?: string; model?: string; baseUrl?: string }) {
  setSetting('llm_provider', p.provider);
  if (p.apiKey) setSetting('llm_key_enc', encryptSecret(p.apiKey.trim()));
  if (p.model !== undefined) (p.model ? setSetting('llm_model', p.model.trim()) : delSetting('llm_model'));
  if (p.baseUrl !== undefined) (p.baseUrl ? setSetting('llm_base_url', p.baseUrl.trim()) : delSetting('llm_base_url'));
}

export function clearLlmConfig() {
  for (const k of ['llm_provider', 'llm_key_enc', 'llm_model', 'llm_base_url']) delSetting(k);
}

/** Safe-to-send view of the config: never includes the key. */
export function publicLlmStatus() {
  const c = getLlmConfig();
  const mode = getSetting('ai_mode_pref') === 'lite' ? 'lite' : 'auto';
  if (!c) return { configured: false, mode, provider: null as ProviderId | null, model: null as string | null, baseUrl: null as string | null, source: null, keyHint: null as string | null };
  return { configured: true, mode, provider: c.provider, model: c.model, baseUrl: c.baseUrl, source: c.source, keyHint: '••••' + c.apiKey.slice(-4) };
}
