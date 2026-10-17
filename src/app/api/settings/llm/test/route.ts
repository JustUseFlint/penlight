import { route } from '@/lib/api';
import { getLlmConfig } from '@/lib/llm/config';
import { testConnection } from '@/lib/llm/client';
export const POST = route(async () => {
  const cfg = getLlmConfig();
  if (!cfg) throw new Error('No API key is configured yet.');
  return await testConnection(cfg);
});
