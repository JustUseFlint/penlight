import { route, body } from '@/lib/api';
import { reviewCard } from '@/lib/cards';
import type { Grade } from '@/lib/srs';
export const POST = route(async ({ user, tz, req }) => {
  const b = await body<{ cardId: string; grade: number }>(req);
  if (![0, 1, 2, 3].includes(b.grade)) throw new Error('Bad grade');
  return reviewCard(user.id, b.cardId, b.grade as Grade, tz);
});
