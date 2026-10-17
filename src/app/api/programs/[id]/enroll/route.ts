import { route } from '@/lib/api';
import { enroll } from '@/lib/programs-db';
export const POST = route<{ id: string }>(async ({ user }, { id }) => { enroll(user.id, id); return { ok: true }; });
