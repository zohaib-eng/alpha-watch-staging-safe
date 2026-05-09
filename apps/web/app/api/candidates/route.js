import { requireAdmin, requireOperator } from '../_lib/auth';
import { withDb } from '../_lib/db';
import { writeAudit } from '../_lib/audit';

export async function GET(request) {
  const { response } = requireOperator(request);
  if (response) return response;

  try {
    return await withDb(async client => {
      const res = await client.query('SELECT * FROM candidates ORDER BY score DESC LIMIT 50');
      return Response.json(res.rows);
    });
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: 'Failed to fetch candidates' }, { status: 500 });
  }
}

export async function POST(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  try {
    const candidate = await request.json();

    if (!candidate.id || !candidate.token || !candidate.pair || !candidate.chain || !candidate.venue) {
      return Response.json({ error: 'Missing required fields: id, token, pair, chain, venue' }, { status: 400 });
    }

    return await withDb(async client => {
      const query = `
        INSERT INTO candidates
          (id, token, pair, input_mint, output_mint, amount, contract_address, chain, venue, score, status, liquidity_usd, volume_24h_usd, arb_gap_pct)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          token = EXCLUDED.token,
          pair = EXCLUDED.pair,
          input_mint = EXCLUDED.input_mint,
          output_mint = EXCLUDED.output_mint,
          amount = EXCLUDED.amount,
          contract_address = EXCLUDED.contract_address,
          chain = EXCLUDED.chain,
          venue = EXCLUDED.venue,
          score = EXCLUDED.score,
          status = EXCLUDED.status,
          liquidity_usd = EXCLUDED.liquidity_usd,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          arb_gap_pct = EXCLUDED.arb_gap_pct
        RETURNING *
      `;

      const values = [
        candidate.id,
        candidate.token,
        candidate.pair,
        candidate.input_mint || candidate.inputMint || null,
        candidate.output_mint || candidate.outputMint || null,
        candidate.amount || 1000000,
        candidate.contract_address || null,
        candidate.chain,
        candidate.venue,
        candidate.score || 0,
        candidate.status || 'WATCH',
        candidate.liquidity_usd || 0,
        candidate.volume_24h_usd || 0,
        candidate.arb_gap_pct || 0
      ];

      const res = await client.query(query, values);
      await writeAudit(client, {
        type: 'CANDIDATE_UPSERTED',
        actor: actor.id,
        message: `Candidate ${candidate.id} added or updated`,
        metadata: { candidateId: candidate.id }
      });

      return Response.json({ success: true, candidate: res.rows[0] });
    });
  } catch (error) {
    console.error('DB Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
