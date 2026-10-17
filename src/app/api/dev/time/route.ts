import { route, body } from '@/lib/api';
import { setSimDays } from '@/lib/db';
export const POST = route(async ({ req }) => {
  if (process.env.ALLOW_TIME_TRAVEL !== '1') throw new Error('Time travel is disabled.');
  const b = await body<{ days: number }>(req);
  setSimDays(Number(b.days) || 0);
  return { days: Number(b.days) || 0 };
});
