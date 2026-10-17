import { route, body } from '@/lib/api';
import { addCard } from '@/lib/cards';
export const POST = route(async ({ user, req }) => {
  const b = await body<{ deckId: string; front: string; back: string; type?: 'term' | 'qa' | 'cloze' }>(req);
  return { id: addCard(user.id, b.deckId, b.front || '', b.back || '', b.type) };
});
