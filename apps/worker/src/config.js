export const config = {
  tradingEnabled: process.env.TRADING_ENABLED === "true",
  mandatoryApprovals: process.env.MANDATORY_APPROVALS !== "false",
  executionMode: process.env.EXECUTION_MODE || "dry-run",
  maxRiskPerTradeBps: Number(process.env.MAX_RISK_PER_TRADE_BPS || 150),
  maxConcurrentPositions: Number(process.env.MAX_CONCURRENT_POSITIONS || 6)
};
