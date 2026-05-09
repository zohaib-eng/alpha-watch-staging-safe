export const runtime = 'nodejs';

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { requireOperator } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';
import { getExecutionMode, isTradingEnabled } from '../../_lib/risk';
import { zeroxQuote } from '../../_lib/zerox';

function requireBasePayload(payload) {
  const { sellToken, buyToken, sellAmount, taker } = payload || {};
  if (!sellToken || !buyToken || !sellAmount || !taker) {
    throw new Error('sellToken, buyToken, sellAmount, and taker required');
  }
  return { sellToken, buyToken, sellAmount, taker };
}

async function executeBaseTransaction(transaction) {
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === '0x') {
    throw new Error('PRIVATE_KEY is required for live Base execution');
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const transport = http(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });
  const hash = await walletClient.sendTransaction({
    to: transaction.to,
    data: transaction.data,
    value: BigInt(transaction.value || '0')
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function POST(request) {
  const { actor, response } = requireOperator(request);
  if (response) return response;

  try {
    const payload = await request.json();
    const { sellToken, buyToken, sellAmount, taker } = requireBasePayload(payload);
    const executionMode = getExecutionMode();

    const quote = await zeroxQuote({
      chainId: 8453,
      sellToken,
      buyToken,
      sellAmount,
      taker
    });

    let result = {
      mode: executionMode,
      provider: '0x',
      quote,
      wouldExecute: executionMode !== 'dry-run'
    };

    if (executionMode === 'live') {
      if (!isTradingEnabled()) throw new Error('Live trading is disabled by kill switch');
      const tx = await executeBaseTransaction(quote.transaction);
      result = { ...result, txHash: tx.hash, receipt: tx.receipt };
    }

    await withDb(async client => {
      await writeAudit(client, {
        type: executionMode === 'live' ? 'BASE_TRADE_EXECUTED' : 'BASE_TRADE_SIMULATED',
        actor: actor.id,
        message: `Base trade ${executionMode}: ${sellToken} to ${buyToken}`,
        metadata: { sellToken, buyToken, sellAmount, taker, txHash: result.txHash || null }
      });
    });

    return Response.json(result);
  } catch (error) {
    console.error('Base trade error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
