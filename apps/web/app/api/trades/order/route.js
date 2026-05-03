export const runtime = "nodejs";
import pkg from 'pg';
const { Client } = pkg;
import { Connection } from '@solana/web3.js';
import { fetch as undiciFetch } from "undici";
const defaultJupiterBase = "https://quote-api.jup.ag/v6";
const jupiterBase = process.env.JUPITER_SWAP_BASE_URL || defaultJupiterBase;

// async function jupiterQuote(params) {
//   console.log("🔥 INSIDE QUOTE FUNCTION");
//   const { inputMint, outputMint, amount, slippageBps } = params;

//   console.log("[QUOTE DEBUG]", { inputMint, outputMint, amount });

//   const url = new URL("https://quote-api.jup.ag/v6/quote");

//   url.searchParams.set("inputMint", inputMint);
//   url.searchParams.set("outputMint", outputMint);
//   url.searchParams.set("amount", amount);

//   if (slippageBps) {
//     url.searchParams.set("slippageBps", String(slippageBps));
//   }

//   console.log("[QUOTE URL]", url.toString());

//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), 15000);

//   try {
//     const res = await undiciFetch(url.toString(), {
//       method: "GET",
//       signal: controller.signal,
//       headers: {
//         Accept: "application/json",
//         "User-Agent": "Mozilla/5.0"
//       }
//     });

//     const text = await res.text();

//     console.log("[QUOTE STATUS]", res.status);

//     if (!res.ok) {
//       console.log("[QUOTE ERROR BODY]", text);
//       throw new Error(`Jupiter API ${res.status}: ${text}`);
//     }

//     return JSON.parse(text);

//   } catch (err) {
//     console.error("[QUOTE FETCH FAILED]", {
//       message: err.message,
//       name: err.name,
//       cause: err.cause
//     });

//     throw new Error(`Jupiter quote failed: ${err.message}`);
//   } finally {
//     clearTimeout(timeout);
//   }
// }
// async function jupiterQuote(params) {
//   console.log("🔥 INSIDE QUOTE FUNCTION");

//   const { inputMint, outputMint, amount, slippageBps } = params;

//   const url = new URL("https://quote-api.jup.ag/v6/quote");

//   url.searchParams.set("inputMint", inputMint);
//   url.searchParams.set("outputMint", outputMint);
//   url.searchParams.set("amount", amount);

//   if (slippageBps) {
//     url.searchParams.set("slippageBps", String(slippageBps));
//   }

//   console.log("[QUOTE URL]", url.toString());

//   try {
//     const res = await fetch(url.toString(), {
//       method: "GET",
//       headers: {
//         Accept: "application/json",
//         "User-Agent": "Mozilla/5.0"
//       }
//     });

//     const text = await res.text();

//     console.log("[QUOTE STATUS]", res.status);

//     if (!res.ok) {
//       console.log("[QUOTE ERROR]", text);
//       throw new Error(`Jupiter ${res.status}: ${text}`);
//     }

//     return JSON.parse(text);

//   } catch (err) {
//     console.log("🔥 FETCH FAILED:", err.message);
//     throw err;
//   }
// }

async function jupiterQuote(params) {
  console.log("🔥 INSIDE QUOTE FUNCTION");

  const { inputMint, outputMint, amount, slippageBps } = params;

  const url = new URL("https://quote-api.jup.ag/v6/quote");

  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);

  if (slippageBps) {
    url.searchParams.set("slippageBps", String(slippageBps));
  }

  console.log("[QUOTE URL]", url.toString());

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await res.text();

    console.log("[QUOTE STATUS]", res.status);
    console.log("[QUOTE BODY]", text.slice(0, 200));

    if (!res.ok) {
      throw new Error(`Jupiter API ${res.status}: ${text}`);
    }

    return JSON.parse(text);

  } catch (err) {
    console.log("🔥 FETCH FAILED FULL ERROR:", {
      message: err.message,
      name: err.name,
      cause: err.cause
    });

    throw new Error("Jupiter quote failed: " + err.message);
  }
}

async function jupiterQuoteToTransaction(quoteResponse, userPublicKey) {
  const url = "https://quote-api.jup.ag/v6/swap";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true
    })
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Swap failed ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

// function resolveCandidateSwapData(candidate) {
//   const pair = (candidate.pair || '').toUpperCase();

//   switch (pair) {
//     case 'SOL/USDC':
//       return {
//         inputMint: 'So11111111111111111111111111111111111111112',
//         outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         amount: '1000000'
//       }
//     case 'USDC/SOL':
//       return {
//         inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         outputMint: 'So11111111111111111111111111111111111111112',
//         amount: '1000000'
//       }
//     case 'USDC/USDT':
//       return {
//         inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt',
//         amount: '1000000'
//       }
//     default:
//       return {
//         inputMint: candidate.inputmint || 'So11111111111111111111111111111111111111112',
//         outputMint: candidate.outputmint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         amount: String(candidate.amount || 1000000)
//       }
//   }
// }
function resolveCandidateSwapData(candidate) {
  const pair = (candidate.pair || '').toUpperCase();

  const inputMint = candidate.inputMint || candidate.input_mint;
  const outputMint = candidate.outputMint || candidate.output_mint;

  if (inputMint && outputMint) {
    return {
      inputMint,
      outputMint,
      amount: String(candidate.amount || 1000000)
    };
  }

  switch (pair) {
    case 'SOL/USDC':
      return {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000'
      };

    case 'USDC/USDT':
      return {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt',
        amount: '1000000'
      };

    case 'USDC/SOL':
      return {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'So11111111111111111111111111111111111111112',
        amount: '1000000'
      };

    default:
      throw new Error(`Invalid candidate pair: ${pair}`);
  }
}

export async function POST(request) {
  const { candidateId, wallet } = await request.json();

  if (!candidateId || !wallet) {
    return Response.json({ error: 'candidateId and wallet required' }, { status: 400 });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  try {
    console.log('[ORDER] Starting order creation for candidate:', candidateId);
    await client.connect();
    console.log('[ORDER] Database connected');

    // Fetch candidate
    const candidateRes = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
    const candidate = candidateRes.rows[0];
    if (!candidate) {
      await client.end();
      return Response.json({ error: 'Candidate not found' }, { status: 404 });
    }
    console.log('[ORDER] Candidate found:', candidate.pair, 'Chain:', candidate.chain);
    console.log('[ORDER] Chain value type:', typeof candidate.chain);
    console.log('[ORDER] Chain value length:', candidate.chain?.length);
    console.log('[ORDER] Chain lowercased:', candidate.chain?.toLowerCase());

    if (!candidate.chain || candidate.chain.toLowerCase() !== 'solana') {
      console.log('[ORDER] Chain validation failed:', {
        hasChain: !!candidate.chain,
        chainValue: candidate.chain,
        chainLower: candidate.chain?.toLowerCase(),
        isNotSolana: candidate.chain?.toLowerCase() !== 'solana'
      });
      await client.end();
      return Response.json({ error: 'Only Solana supported in this version' }, { status: 400 });
    }

    // Resolve mints and amount from the candidate metadata
    const { inputMint, outputMint, amount } = resolveCandidateSwapData(candidate);
    console.log('[ORDER] Resolved swap data:', { inputMint, outputMint, amount });

    console.log(`[ORDER] Creating quote for ${candidate.pair} using ${inputMint} → ${outputMint} (${amount})`);

    // const quote = await jupiterQuote({
    //   inputMint,
    //   outputMint,
    //   amount,
    //   slippageBps: 100,
    //   onlyDirectRoutes: false,
    //   asLegacyTransaction: false
    // });

    let quote;

    try {
      console.log('[ORDER] Trying primary route...');
      quote = await jupiterQuote({
        inputMint,
        outputMint,
        amount,
        slippageBps: 100,
        onlyDirectRoutes: false
      });
    } catch (err) {
      console.log('[ORDER] Primary route failed, switching to fallback (USDC → SOL)...');

      // fallback ONLY if USDC/USDT case
      if (candidate.pair.toUpperCase() === 'USDC/USDT') {
        quote = await jupiterQuote({
          inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          outputMint: 'So11111111111111111111111111111111111111112', // SOL
          amount,
          slippageBps: 100,
          onlyDirectRoutes: false
        });
      } else {
        throw err; // agar koi aur pair hai to error throw karo
      }
    }

    console.log('[ORDER] Quote received:', { outAmount: quote.outAmount, inAmount: quote.inAmount });

    // Convert quote to transaction
    console.log('[ORDER] Converting quote to transaction...');
    const txData = await jupiterQuoteToTransaction(quote, wallet);

    console.log('[ORDER] Transaction created, serializing...');

    const rawTx = txData.swapTransaction || txData.transaction;

    if (!rawTx) {
      throw new Error("No swap transaction returned from Jupiter");
    }

    const swapTransactionBuf = Buffer.from(rawTx, "base64");
    const transaction = rawTx;

    // // Deserialize and re-serialize the transaction to send to client
    // const swapTransactionBuf = Buffer.from(txData.swapTransaction, "base64");
    // const transaction = Buffer.from(swapTransactionBuf).toString('base64');

    await client.end();
    console.log('[ORDER] Order creation successful');

    return Response.json({
      success: true,
      transaction,
      quote: {
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        impact: quote.priceImpactPct,
        routes: quote.routePlan?.length || 0
      }
    });

  } catch (error) {
    console.error('[ORDER] Order creation error:', error.message);
    console.error('[ORDER] Full error:', error);
    await client.end();
    return Response.json({ error: 'Failed to create order: ' + error.message }, { status: 500 });
  }
}
