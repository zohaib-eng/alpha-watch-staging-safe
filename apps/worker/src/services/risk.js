import { config } from "../config.js";

export function requireApproval(candidate, amountUsd) {
  if (!config.mandatoryApprovals) return false;
  if (candidate.customAdded) return true;
  if (candidate.riskLevel && candidate.riskLevel !== "LOW") return true;
  if ((candidate.score || 0) < 80) return true;
  if (amountUsd > 1000) return true;
  return true;
}

export function enforceRisk(candidate, amountUsd) {
  if ((candidate.score || 0) < 75) throw new Error("Score below execution floor");
  const liquidityUsd = candidate.liquidityUsd ?? candidate.liquidity_usd ?? 0;
  const arbGapPct = candidate.arbGapPct ?? candidate.arb_gap_pct ?? 0;
  if (Number(liquidityUsd) < 250000) throw new Error("Insufficient liquidity");
  if (Number(arbGapPct) > 15) throw new Error("Suspicious arb gap");
  if (amountUsd > Number(liquidityUsd) * 0.01) throw new Error("Size too large for pool");
}
