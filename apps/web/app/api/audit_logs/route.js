import { requireOperator } from '../_lib/auth';
import { withDb } from '../_lib/db';

export async function GET(request) {
  const { response } = requireOperator(request);
  if (response) return response;

  try {
    return await withDb(async client => {
      const res = await client.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
      return Response.json(res.rows);
    });
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
