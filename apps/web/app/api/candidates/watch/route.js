import { requireAdmin } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';

export async function POST(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  try {
    const { candidateId, status } = await request.json();
    const normalizedStatus = String(status || '').toUpperCase();

    if (!candidateId || !['WATCH', 'INACTIVE'].includes(normalizedStatus)) {
      return Response.json({ error: 'candidateId and status WATCH/INACTIVE required' }, { status: 400 });
    }

    return await withDb(async client => {
      const res = await client.query(
        'UPDATE candidates SET status = $1 WHERE id = $2 RETURNING *',
        [normalizedStatus, candidateId]
      );

      const candidate = res.rows[0];
      if (!candidate) {
        return Response.json({ error: 'Candidate not found' }, { status: 404 });
      }

      await writeAudit(client, {
        type: 'WATCHLIST_UPDATED',
        actor: actor.id,
        message: `Candidate ${candidateId} status updated to ${normalizedStatus}`,
        metadata: { candidateId, status: normalizedStatus }
      });

      return Response.json({ success: true, candidate });
    });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
