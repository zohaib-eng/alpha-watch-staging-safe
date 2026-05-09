import { requireAdmin } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';

export async function POST(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  try {
    const { candidateId, enabled, mode = 'dry-run' } = await request.json();
    const normalizedMode = String(mode || 'dry-run').toLowerCase();

    if (!candidateId || typeof enabled !== 'boolean') {
      return Response.json({ error: 'candidateId and enabled boolean required' }, { status: 400 });
    }

    if (!['dry-run', 'shadow-order'].includes(normalizedMode)) {
      return Response.json({ error: 'Auto mode must be dry-run or shadow-order' }, { status: 400 });
    }

    return await withDb(async client => {
      const res = await client.query(
        `UPDATE candidates
         SET auto_trade_enabled = $1, auto_trade_mode = $2
         WHERE id = $3
         RETURNING *`,
        [enabled, normalizedMode, candidateId]
      );

      const candidate = res.rows[0];
      if (!candidate) return Response.json({ error: 'Candidate not found' }, { status: 404 });

      await writeAudit(client, {
        type: enabled ? 'AUTO_TRADE_ENABLED' : 'AUTO_TRADE_DISABLED',
        actor: actor.id,
        message: `Auto trade ${enabled ? 'enabled' : 'disabled'} for candidate ${candidateId}`,
        metadata: { candidateId, enabled, mode: normalizedMode }
      });

      return Response.json({ success: true, candidate });
    });
  } catch (error) {
    console.error('Auto trade toggle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
