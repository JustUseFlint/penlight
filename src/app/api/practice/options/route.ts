import { route } from '@/lib/api';
import { practiceOptions } from '@/lib/practice';
export const GET = route(async ({ user }) => practiceOptions(user.id));
