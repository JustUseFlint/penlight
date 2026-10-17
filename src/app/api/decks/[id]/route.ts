import { route } from '@/lib/api';
import { getDeck } from '@/lib/cards';
export const GET = route<{ id: string }>(async ({ user, tz }, { id }) => { const d = getDeck(user.id, decodeURIComponent(id), tz); if (!d) throw new Error('Deck not found'); return d; });
