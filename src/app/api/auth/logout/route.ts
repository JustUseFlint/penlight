import { route } from '@/lib/api';
import { logOut } from '@/lib/auth';
export const POST = route(async () => { await logOut(); return { ok: true }; });
