import { route, body } from '@/lib/api';
import { deleteCard, updateCard } from '@/lib/cards';
export const PATCH = route<{ id: string }>(async ({ user, req }, { id }) => { const b = await body<{ front: string; back: string }>(req); updateCard(user.id, id, b.front || '', b.back ?? ''); return { ok: true }; });
export const DELETE = route<{ id: string }>(async ({ user }, { id }) => { deleteCard(user.id, id); return { ok: true }; });
