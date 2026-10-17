import { route } from '@/lib/api';
import { getAttempt } from '@/lib/practice';
export const GET = route<{ id: string }>(async ({ user }, { id }) => { const a = getAttempt(user.id, id); if (!a) throw new Error('Attempt not found'); return a; });
