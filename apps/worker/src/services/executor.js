import { config } from "../config.js";
import { jupiterOrder, jupiterExecute } from "./jupiter.js";
import { zeroxQuote } from "./zerox.js";
import { executeBaseSwap } from "../adapters/evm.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt";

function resolveSolanaSwap(candidate) {
  const inputMint = candidate.inputMint || candidate.input_mint;
  const outputMint = candidate.outputMint || candidate.output_mint;
  if (inputMint && outputMint) return { inputMint, outputMint };

  const pair = (candidate.pair || "").toUpperCase();
  if (pair === "SOL/USDC") return { inputMint: SOL_MINT, outputMint: USDC_MINT };
  if (pair === "USDC/SOL") return { inputMint: USDC_MINT, outputMint: SOL_MINT };
  if (pair === "USDC/USDT") return { inputMint: USDC_MINT, outputMint: USDT_MINT };
  throw new Error(`Unsupported Solana pair: ${pair}`);
}

export async function executeCandidate(candidate) {
  const amountUsd = 100;
  const chain = candidate.chain?.toLowerCase();
  
  if (chain === "solana") {
    const { inputMint, outputMint } = resolveSolanaSwap(candidate);
    const order = await jupiterOrder({
      inputMint,
      outputMint,
      amount: String(candidate.amount || 1000000),
      taker: candidate.taker || "11111111111111111111111111111111",
      slippageBps: 100
    });

    if (config.executionMode === "dry-run") return { mode: "dry-run", provider: "jupiter", order };
    if (config.executionMode === "shadow-order") return { mode: "shadow-order", provider: "jupiter", order, wouldExecute: true };
    const execute = await jupiterExecute({ signedTransaction: candidate.signedTransaction || "" });
    return { mode: "live", provider: "jupiter", order, execute };
  }

  if (chain === "base") {
    const quote = await zeroxQuote({
      chainId: 8453,
      sellToken: candidate.sellToken,
      buyToken: candidate.buyToken,
      sellAmount: candidate.sellAmount
    });
    if (config.executionMode === "dry-run") return { mode: "dry-run", provider: "0x", quote };
    if (config.executionMode === "shadow-order") return { mode: "shadow-order", provider: "0x", quote, wouldExecute: true };
    const tx = await executeBaseSwap({ to: quote.transaction.to, data: quote.transaction.data, value: BigInt(quote.transaction.value || "0") });
    return { mode: "live", provider: "0x", quote, tx };
  }

  throw new Error("Unsupported chain");
}
