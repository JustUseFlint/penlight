import { route, body } from '@/lib/api';
import { createDeck, listDecks } from '@/lib/cards';
export const GET = route(async ({ user, tz }) => ({ decks: listDecks(user.id, tz) }));
export const POST = route(async ({ user, req }) => { const b = await body<{ title: string }>(req); return { id: createDeck(user.id, b.title || 'My deck') }; });
