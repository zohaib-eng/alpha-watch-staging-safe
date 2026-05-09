export const runtime = 'nodejs';

import { withDb } from '../_lib/db';

export async function GET() {
  const started = Date.now();
  const checks = {
    app: 'ok',
    db: 'unknown',
    counts: {}
  };

  try {
    await withDb(async client => {
      await client.query('SELECT 1');
      checks.db = 'ok';
      const counts = await client.query(`
        SELECT
          (SELECT count(*)::int FROM candidates) AS candidates,
          (SELECT count(*)::int FROM approvals WHERE status = 'PENDING') AS pending_approvals,
          (SELECT count(*)::int FROM audit_logs) AS audit_logs
      `);
      checks.counts = counts.rows[0];
    });
  } catch (error) {
    checks.db = 'error';
    checks.error = error.message;
  }

  const ok = checks.db === 'ok';
  return Response.json(
    {
      ok,
      checks,
      uptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
