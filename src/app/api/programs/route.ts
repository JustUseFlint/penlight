import { route } from '@/lib/api';
import { listPrograms } from '@/lib/programs-db';
export const GET = route(async ({ user }) => ({ programs: listPrograms(user.id) }));
