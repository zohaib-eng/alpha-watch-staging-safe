import pkg from 'pg';
const { Client } = pkg;
import { Connection, VersionedTransaction } from '@solana/web3.js';

export async function POST(request) {
  const { candidateId, signedTransaction, wallet } = await request.json();

  if (!candidateId || !signedTransaction || !wallet) {
    return Response.json(
      { error: 'candidateId, signedTransaction, and wallet required' },
      { status: 400 }
    );
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  try {
    await client.connect();

    // Fetch candidate
    const candidateRes = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
    const candidate = candidateRes.rows[0];
    if (!candidate) {
      await client.end();
      return Response.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Get execution mode
    const executionMode = process.env.EXECUTION_MODE || 'dry-run';
    console.log(`Execution mode: ${executionMode}`);

    let result;
    let txHash = null;

    if (executionMode === 'dry-run') {
      // Dry-run mode: just validate and return
      result = {
        mode: 'dry-run',
        message: 'Transaction would execute but dry-run is enabled',
        simulatedTxHash: `0x${'simulated'.padEnd(64, '0')}`
      };
      console.log('Dry-run mode: transaction not submitted');
    } else if (executionMode === 'shadow-order') {
      // Shadow mode: simulate execution
      result = {
        mode: 'shadow-order',
        message: 'Transaction simulated (shadow order)',
        wouldExecute: true,
        simulatedTxHash: `0x${'shadow'.padEnd(64, '0')}`
      };
      console.log('Shadow-order mode: transaction simulated');
    } else if (executionMode === 'live') {
      // LIVE mode: actually submit to blockchain
      try {
        const connection = new Connection(
          process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
          'confirmed'
        );

        // Deserialize signed transaction
        const txBuffer = Buffer.from(signedTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuffer);

        console.log('Submitting transaction to Solana blockchain...');

        // Send transaction
        const signature = await connection.sendTransaction(tx, {
          preflightCommitment: 'confirmed'
        });

        console.log(`Transaction submitted: ${signature}`);

        // Wait for confirmation
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

        console.log(`✅ Trade executed live: ${signature}`);
      } catch (blockchainError) {
        console.error('Blockchain submission error:', blockchainError);
        result = {
          mode: 'live',
          error: blockchainError.message,
          message: 'Failed to submit transaction'
        };
      }
    }

    // Log to audit_logs
    await client.query(
      'INSERT INTO audit_logs (type, actor, message, metadata) VALUES ($1, $2, $3, $4)',
      [
        txHash ? 'TRADE_EXECUTED_LIVE' : `TRADE_${executionMode.toUpperCase()}`,
        wallet,
        `Trade execution ${executionMode}: candidate ${candidateId}`,
        {
          candidateId,
          wallet,
          executionMode,
          txHash: txHash || result.simulatedTxHash,
          candidate: {
            token: candidate.token,
            pair: candidate.pair,
            chain: candidate.chain,
            score: candidate.score
          }
        }
      ]
    );

    await client.end();
    return Response.json(result);
  } catch (error) {
    console.error('Trade execution error:', error);
    await client.end();
    return Response.json(
      { error: 'Failed to execute trade: ' + error.message },
      { status: 500 }
    );
  }
}