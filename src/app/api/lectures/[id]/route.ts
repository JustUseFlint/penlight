import { route, body } from '@/lib/api';
import { deleteLecture, getLecture, getSegments, renameLecture } from '@/lib/library';
export const GET = route<{ id: string }>(async ({ user, req }, { id }) => {
  const l = getLecture(user.id, id);
  if (!l) throw new Error('Study set not found');
  const wantTranscript = new URL(req.url).searchParams.get('transcript');
  return wantTranscript ? { ...l, segments: getSegments(user.id, id) } : l;
});
export const PATCH = route<{ id: string }>(async ({ user, req }, { id }) => {
  const b = await body<{ title: string }>(req);
  if (!b.title?.trim()) throw new Error('Enter a title.');
  if (!renameLecture(user.id, id, b.title)) throw new Error('Study set not found');
  return { ok: true };
});
export const DELETE = route<{ id: string }>(async ({ user }, { id }) => { if (!deleteLecture(user.id, id)) throw new Error('Study set not found'); return { ok: true }; });
