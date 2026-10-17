import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for hosts (Render, Fly, Cloud Run…): verifies the DB opens and answers a query. */
export async function GET() {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM sqlite_master').get() as { n: number };
    return NextResponse.json({ ok: true, app: 'penlight', db: row.n > 0 ? 'ready' : 'empty', persistence: process.env.PERSIST_DATABASE_URL ? 'postgres-snapshots' : 'local-disk', time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
