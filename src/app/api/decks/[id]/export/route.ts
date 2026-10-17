import { route } from '@/lib/api';
import { ankiCsv } from '@/lib/cards';
export const GET = route<{ id: string }>(async ({ user }, { id }) => {
  const r = ankiCsv(user.id, decodeURIComponent(id));
  if (!r) throw new Error('Deck not found');
  return new Response(r.body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${r.filename}"` } });
});
