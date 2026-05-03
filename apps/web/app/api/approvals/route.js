import pkg from 'pg';
const { Client } = pkg;

export async function GET() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  try {
    await client.connect();
    const res = await client.query('SELECT * FROM approvals ORDER BY created_at DESC');
    await client.end();
    return Response.json(res.rows);
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}