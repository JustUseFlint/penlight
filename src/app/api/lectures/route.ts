import { route } from '@/lib/api';
import { listLectures } from '@/lib/library';
export const GET = route(async ({ user }) => ({ lectures: listLectures(user.id) }));
