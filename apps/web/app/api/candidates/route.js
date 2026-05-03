import pkg from 'pg';
const { Client } = pkg;

export async function GET() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  try {
    await client.connect();
    const res = await client.query('SELECT * FROM candidates ORDER BY score DESC LIMIT 10');
    await client.end();
    return Response.json(res.rows);
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: 'Failed to fetch candidates' }, { status: 500 });
  }
}

export async function POST(req) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  try {
    const candidate = await req.json();
    
    // Validate required fields
    if (!candidate.id || !candidate.token || !candidate.pair || !candidate.chain || !candidate.venue) {
      return Response.json({ error: 'Missing required fields: id, token, pair, chain, venue' }, { status: 400 });
    }

    await client.connect();
    const query = `
      INSERT INTO candidates (id, token, pair, contract_address, chain, venue, score, status, liquidity_usd, volume_24h_usd, arb_gap_pct)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        score = EXCLUDED.score,
        status = EXCLUDED.status,
        liquidity_usd = EXCLUDED.liquidity_usd,
        volume_24h_usd = EXCLUDED.volume_24h_usd,
        arb_gap_pct = EXCLUDED.arb_gap_pct
    `;
    
    const values = [
      candidate.id,
      candidate.token,
      candidate.pair,
      candidate.contract_address || null,
      candidate.chain,
      candidate.venue,
      candidate.score || 0,
      candidate.status || 'WATCH',
      candidate.liquidity_usd || 0,
      candidate.volume_24h_usd || 0,
      candidate.arb_gap_pct || 0
    ];

    await client.query(query, values);
    await client.end();

    return Response.json({ success: true, message: `Candidate ${candidate.id} added/updated` });
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
