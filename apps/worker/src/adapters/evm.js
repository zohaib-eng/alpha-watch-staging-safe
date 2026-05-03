import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { config } from "../config.js";

const account = process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== "0x" ? privateKeyToAccount(process.env.PRIVATE_KEY) : null;
const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
const walletClient = account ? createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL) }) : null;

export async function executeBaseSwap({ to, data, value = 0n }) {
  if (config.executionMode !== "live" || !config.tradingEnabled) {
    return { ok: true, mode: config.executionMode, txHash: null, note: "No submission in safe mode", to, data };
  }
  if (!walletClient) throw new Error("Wallet client unavailable");
  const hash = await walletClient.sendTransaction({ to, data, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { ok: receipt.status === "success", mode: "live", txHash: hash, receipt };
}
