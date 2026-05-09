export const runtime = 'nodejs';

import { Connection, VersionedTransaction } from '@solana/web3.js';
import { requireOperator } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';
import { ensureTradeAllowed, getExecutionMode } from '../../_lib/risk';

export async function POST(request) {
  const { actor, response } = requireOperator(request);
  if (response) return response;

  try {
    const { candidateId, signedTransaction, wallet } = await request.json();

    if (!candidateId || !signedTransaction || !wallet) {
      return Response.json(
        { error: 'candidateId, signedTransaction, and wallet required' },
        { status: 400 }
      );
    }

    return await withDb(async client => {
      const candidateRes = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      const candidate = candidateRes.rows[0];
      if (!candidate) {
        return Response.json({ error: 'Candidate not found' }, { status: 404 });
      }

      const approval = await ensureTradeAllowed(client, candidate, wallet);
      if (!approval) {
        return Response.json({ error: 'Approved trade approval is required' }, { status: 403 });
      }

      const executionMode = getExecutionMode();
      let result;
      let txHash = null;

      if (executionMode === 'dry-run') {
        result = {
          mode: 'dry-run',
          message: 'Transaction validated but dry-run is enabled',
          simulatedTxHash: `0x${'simulated'.padEnd(64, '0')}`
        };
      } else if (executionMode === 'shadow-order') {
        result = {
          mode: 'shadow-order',
          message: 'Transaction simulated as a shadow order',
          wouldExecute: true,
          simulatedTxHash: `0x${'shadow'.padEnd(64, '0')}`
        };
      } else if (executionMode === 'live') {
        const connection = new Connection(
          process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
          'confirmed'
        );
        const txBuffer = Buffer.from(signedTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuffer);
        const signature = await connection.sendTransaction(tx, { preflightCommitment: 'confirmed' });
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        txHash = signature;
        result = {
          mode: 'live',
          message: 'Transaction executed on Solana blockchain',
          txHash: signature,
          confirmed: true,
          explorerUrl: `https://solscan.io/tx/${signature}`
        };
      } else {
        return Response.json({ error: `Unsupported EXECUTION_MODE: ${executionMode}` }, { status: 400 });
      }

      await writeAudit(client, {
        type: txHash ? 'TRADE_EXECUTED_LIVE' : `TRADE_${executionMode.toUpperCase()}`,
        actor: actor.id,
        message: `Trade execution ${executionMode}: candidate ${candidateId}`,
        metadata: {
          candidateId,
          wallet,
          approvalId: approval.id,
          executionMode,
          txHash: txHash || result.simulatedTxHash,
          candidate: {
            token: candidate.token,
            pair: candidate.pair,
            chain: candidate.chain,
            score: candidate.score
          }
        }
      });

      return Response.json(result);
    });
  } catch (error) {
    console.error('Trade execution error:', error);
    return Response.json(
      { error: 'Failed to execute trade: ' + error.message },
      { status: 500 }
    );
  }
}
