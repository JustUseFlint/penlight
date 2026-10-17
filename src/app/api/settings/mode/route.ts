import { route, body } from '@/lib/api';
import { setSetting } from '@/lib/db';
import { publicLlmStatus } from '@/lib/llm/config';
export const PUT = route(async ({ req }) => {
  const b = await body<{ mode: 'auto' | 'lite' }>(req);
  setSetting('ai_mode_pref', b.mode === 'lite' ? 'lite' : 'auto');
  return { status: publicLlmStatus() };
});
