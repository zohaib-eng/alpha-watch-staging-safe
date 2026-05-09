export const runtime = 'nodejs';

import { requireOperator } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';
import { ensureTradeAllowed, findOrCreatePendingApproval } from '../../_lib/risk';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt';
const jupiterBase = process.env.JUPITER_SWAP_BASE_URL || 'https://lite-api.jup.ag/swap/v1';

async function jupiterQuote(params) {
  const url = new URL(`${jupiterBase}/quote`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        ...(process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {})
      }
    });
  } catch (error) {
    throw new Error(`Jupiter quote service is unreachable (${error.cause?.code || error.message})`);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter quote failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function jupiterQuoteToTransaction(quoteResponse, userPublicKey) {
  let res;
  try {
    res = await fetch(`${jupiterBase}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {})
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true
      })
    });
  } catch (error) {
    throw new Error(`Jupiter swap service is unreachable (${error.cause?.code || error.message})`);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter swap failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

function resolveCandidateSwapData(candidate) {
  const pair = (candidate.pair || '').toUpperCase();
  const inputMint = candidate.input_mint || candidate.inputMint;
  const outputMint = candidate.output_mint || candidate.outputMint;

  if (inputMint && outputMint) {
    return { inputMint, outputMint, amount: String(candidate.amount || 1000000) };
  }

  if (pair === 'SOL/USDC') return { inputMint: SOL_MINT, outputMint: USDC_MINT, amount: '1000000' };
  if (pair === 'USDC/SOL') return { inputMint: USDC_MINT, outputMint: SOL_MINT, amount: '1000000' };
  if (pair === 'USDC/USDT') return { inputMint: USDC_MINT, outputMint: USDT_MINT, amount: '1000000' };

  throw new Error(`Invalid candidate pair: ${pair}`);
}

export async function POST(request) {
  const { actor, response } = requireOperator(request);
  if (response) return response;

  try {
    const { candidateId, wallet } = await request.json();
    if (!candidateId || !wallet) {
      return Response.json({ error: 'candidateId and wallet required' }, { status: 400 });
    }

    return await withDb(async client => {
      const candidateRes = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      const candidate = candidateRes.rows[0];
      if (!candidate) {
        return Response.json({ error: 'Candidate not found' }, { status: 404 });
      }

      const approval = await ensureTradeAllowed(client, candidate, wallet);
      if (!approval) {
        const pending = await findOrCreatePendingApproval(client, {
          candidate,
          wallet,
          actor: actor.id,
          reason: 'Approval required before trade order creation',
          metadata: { source: 'trade_order' }
        });
        await writeAudit(client, {
          type: 'APPROVAL_REQUIRED',
          actor: actor.id,
          message: `Trade order blocked pending approval for candidate ${candidateId}`,
          metadata: { candidateId, wallet, approvalId: pending.id }
        });
        return Response.json(
          { error: 'Approval required before creating order', approvalRequired: true, approval: pending },
          { status: 403 }
        );
      }

      const { inputMint, outputMint, amount } = resolveCandidateSwapData(candidate);
      let quote = await jupiterQuote({ inputMint, outputMint, amount, slippageBps: 100 });

      if (!quote?.outAmount) throw new Error('Jupiter returned an invalid quote');

      const txData = await jupiterQuoteToTransaction(quote, wallet);
      const transaction = txData.swapTransaction || txData.transaction;
      if (!transaction) throw new Error('No swap transaction returned from Jupiter');

      await writeAudit(client, {
        type: 'ORDER_CREATED',
        actor: actor.id,
        message: `Order created for candidate ${candidateId}`,
        metadata: {
          candidateId,
          wallet,
          approvalId: approval.id,
          quote: {
            inputAmount: quote.inAmount,
            outputAmount: quote.outAmount,
            impact: quote.priceImpactPct,
            routes: quote.routePlan?.length || 0
          }
        }
      });

      return Response.json({
        success: true,
        transaction,
        approvalId: approval.id,
        quote: {
          inputAmount: quote.inAmount,
          outputAmount: quote.outAmount,
          impact: quote.priceImpactPct,
          routes: quote.routePlan?.length || 0
        }
      });
    });
  } catch (error) {
    console.error('[ORDER] Order creation error:', error.message);
    return Response.json({ error: 'Failed to create order: ' + error.message }, { status: 500 });
  }
}
