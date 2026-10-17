import { route } from '@/lib/api';
import { dashboard } from '@/lib/progress';
import { dueCounts } from '@/lib/cards';
export const GET = route(async ({ user, tz }) => ({ ...dashboard(user.id, tz, user.weekly_goal_min), due: dueCounts(user.id, tz) }));
