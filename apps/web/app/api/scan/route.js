import { requireAdmin } from '../_lib/auth';
import { withDb } from '../_lib/db';
import { writeAudit } from '../_lib/audit';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt';

async function getJupiterPrice(inputMint, outputMint) {
  const url = new URL('https://price.jup.ag/v4/price');
  url.searchParams.set('ids', inputMint);
  url.searchParams.set('vsToken', outputMint);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      ...(process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {})
    }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter price failed ${res.status}: ${text}`);

  const data = JSON.parse(text);
  const price = data.data?.[inputMint]?.price || data[inputMint]?.price;
  if (!price) throw new Error(`No Jupiter price returned for ${inputMint}`);
  return Number(price);
}

function calculateScore({ price, liquidity, volume }) {
  let score = 50;
  if (volume > 100000) score += 15;
  if (volume > 500000) score += 10;
  if (liquidity > 500000) score += 15;
  if (liquidity > 1000000) score += 10;
  if (price > 0) score += 5;
  return Math.min(score, 100);
}

export async function POST(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  const solanaPairs = [
    { inputMint: SOL_MINT, outputMint: USDC_MINT, token: 'SOL', pair: 'SOL/USDC', liquidity: 2000000, volume: 750000 },
    { inputMint: USDC_MINT, outputMint: SOL_MINT, token: 'USDC', pair: 'USDC/SOL', liquidity: 1500000, volume: 600000 },
    { inputMint: USDC_MINT, outputMint: USDT_MINT, token: 'USDC', pair: 'USDC/USDT', liquidity: 5000000, volume: 2000000 }
  ];

  try {
    return await withDb(async client => {
      const candidates = [];
      const errors = [];

      for (const pair of solanaPairs) {
        try {
          const price = await getJupiterPrice(pair.inputMint, pair.outputMint);
          const score = calculateScore({ price, liquidity: pair.liquidity, volume: pair.volume });

          if (score > 50) {
            candidates.push({
              id: `${pair.pair.toLowerCase().replace('/', '-')}-${Date.now()}`,
              token: pair.token,
              pair: pair.pair,
              input_mint: pair.inputMint,
              output_mint: pair.outputMint,
              amount: 1000000,
              chain: 'solana',
              venue: 'Jupiter',
              score,
              liquidity_usd: pair.liquidity,
              volume_24h_usd: pair.volume,
              arb_gap_pct: 0
            });
          }
        } catch (error) {
          errors.push({ pair: pair.pair, error: error.message });
        }
      }

      for (const candidate of candidates) {
        await client.query(
          `INSERT INTO candidates
            (id, token, pair, input_mint, output_mint, amount, chain, venue, score, status, liquidity_usd, volume_24h_usd, arb_gap_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'WATCH', $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             score = EXCLUDED.score,
             liquidity_usd = EXCLUDED.liquidity_usd,
             volume_24h_usd = EXCLUDED.volume_24h_usd,
             arb_gap_pct = EXCLUDED.arb_gap_pct`,
          [
            candidate.id,
            candidate.token,
            candidate.pair,
            candidate.input_mint,
            candidate.output_mint,
            candidate.amount,
            candidate.chain,
            candidate.venue,
            candidate.score,
            candidate.liquidity_usd,
            candidate.volume_24h_usd,
            candidate.arb_gap_pct
          ]
        );
      }

      await writeAudit(client, {
        type: errors.length ? 'SCAN_COMPLETED_WITH_ERRORS' : 'SCAN_COMPLETED',
        actor: actor.id,
        message: `Scanner completed with ${candidates.length} candidates`,
        metadata: { inserted: candidates.length, errors }
      });

      return Response.json({
        success: errors.length === 0,
        message: `Scanner completed. Added ${candidates.length} candidates`,
        candidates,
        errors
      });
    });
  } catch (error) {
    console.error('Scanner Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
