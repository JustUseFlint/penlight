import { route } from '@/lib/api';
import { getLesson } from '@/lib/content/load';
export const GET = route<{ id: string }>(async (_c, { id }) => { const l = getLesson(id); if (!l) throw new Error('Lesson not found'); return l; });
