import { requireAdmin, requireOperator } from '../_lib/auth';
import { makeId, withDb } from '../_lib/db';
import { writeAudit } from '../_lib/audit';

export async function GET(request) {
  const { response } = requireOperator(request);
  if (response) return response;

  try {
    return await withDb(async client => {
      const res = await client.query('SELECT * FROM approvals ORDER BY created_at DESC');
      return Response.json(res.rows);
    });
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

export async function POST(request) {
  const { actor, response } = requireOperator(request);
  if (response) return response;

  try {
    const { candidateId, wallet, reason = 'Trade approval requested', metadata = {} } = await request.json();
    if (!candidateId) {
      return Response.json({ error: 'candidateId required' }, { status: 400 });
    }

    return await withDb(async client => {
      const candidateRes = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      if (!candidateRes.rows[0]) {
        return Response.json({ error: 'Candidate not found' }, { status: 404 });
      }

      const approvalRes = await client.query(
        `INSERT INTO approvals (id, candidate_id, wallet, status, reason, requested_by, metadata)
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        [makeId('approval'), candidateId, wallet || null, reason, actor.id, metadata]
      );

      const approval = approvalRes.rows[0];
      await writeAudit(client, {
        type: 'APPROVAL_REQUESTED',
        actor: actor.id,
        message: `Approval requested for candidate ${candidateId}`,
        metadata: { candidateId, wallet, approvalId: approval?.id }
      });

      return Response.json(approval, { status: 201 });
    });
  } catch (error) {
    console.error('Approval request error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  try {
    const { approvalId, status, reason } = await request.json();
    const normalizedStatus = String(status || '').toUpperCase();

    if (!approvalId || !['APPROVED', 'REJECTED'].includes(normalizedStatus)) {
      return Response.json({ error: 'approvalId and status APPROVED/REJECTED required' }, { status: 400 });
    }

    return await withDb(async client => {
      const res = await client.query(
        `UPDATE approvals
         SET status = $1, reason = COALESCE($2, reason), reviewed_by = $3, reviewed_at = now()
         WHERE id = $4
         RETURNING *`,
        [normalizedStatus, reason || null, actor.id, approvalId]
      );

      const approval = res.rows[0];
      if (!approval) {
        return Response.json({ error: 'Approval not found' }, { status: 404 });
      }

      await writeAudit(client, {
        type: normalizedStatus === 'APPROVED' ? 'TRADE_APPROVED' : 'TRADE_REJECTED',
        actor: actor.id,
        message: `${normalizedStatus} approval ${approvalId} for candidate ${approval.candidate_id}`,
        metadata: { approvalId, candidateId: approval.candidate_id, wallet: approval.wallet }
      });

      return Response.json(approval);
    });
  } catch (error) {
    console.error('Approval review error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
