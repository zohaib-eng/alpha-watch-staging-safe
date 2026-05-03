export async function GET(request) {
  return Response.json({
    executionMode: process.env.EXECUTION_MODE || 'dry-run',
    tradingEnabled: process.env.TRADING_ENABLED === 'true',
    mandatoryApprovals: process.env.MANDATORY_APPROVALS === 'true',
    chain: 'Solana',
    timestamp: new Date().toISOString()
  });
}
