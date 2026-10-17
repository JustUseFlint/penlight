import { route } from '@/lib/api';
import { programDetail } from '@/lib/programs-db';
export const GET = route<{ id: string }>(async ({ user }, { id }) => { const p = programDetail(user.id, id); if (!p) throw new Error('Program not found'); return p; });
