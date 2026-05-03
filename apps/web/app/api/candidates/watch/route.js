import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req) {
  try {
    const { candidateId, status } = await req.json();
    if (!candidateId || !status) {
      return Response.json({ error: 'Missing candidateId or status' }, { status: 400 });
    }

    await client.connect();
    await client.query('UPDATE public.candidates SET status = $1 WHERE id = $2', [status, candidateId]);
    await client.end();

    return Response.json({ success: true, message: `Candidate ${candidateId} status updated to ${status}` });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
