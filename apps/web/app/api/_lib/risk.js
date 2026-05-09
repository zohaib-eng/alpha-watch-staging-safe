export function getExecutionMode() {
  return process.env.EXECUTION_MODE || 'dry-run';
}

export function isTradingEnabled() {
  return process.env.TRADING_ENABLED === 'true';
}

export function mandatoryApprovalsEnabled() {
  return process.env.MANDATORY_APPROVALS !== 'false';
}

export function enforceCandidateRisk(candidate, amountUsd = 100) {
  if (!candidate) throw new Error('Candidate not found');
  if ((candidate.status || '').toUpperCase() !== 'WATCH') throw new Error('Candidate is not on the watchlist');
  if ((candidate.chain || '').toLowerCase() !== 'solana') throw new Error('Only Solana is supported by the web execution flow');
  if (Number(candidate.score || 0) < Number(process.env.MIN_CANDIDATE_SCORE || 70)) throw new Error('Score below execution floor');
  if (Number(candidate.liquidity_usd || 0) < Number(process.env.MIN_LIQUIDITY_USD || 250000)) throw new Error('Insufficient liquidity');
  if (Number(candidate.arb_gap_pct || 0) > Number(process.env.MAX_ARB_GAP_PCT || 15)) throw new Error('Suspicious arbitrage gap');
  if (amountUsd > Number(candidate.liquidity_usd || 0) * 0.01) throw new Error('Trade size too large for pool');
}

export async function ensureTradeAllowed(client, candidate, wallet) {
  const executionMode = getExecutionMode();
  enforceCandidateRisk(candidate);

  if (executionMode === 'live' && !isTradingEnabled()) {
    throw new Error('Live trading is disabled by kill switch');
  }

  if (!mandatoryApprovalsEnabled()) return null;

  const approvalRes = await client.query(
    `SELECT * FROM approvals
     WHERE candidate_id = $1
       AND (wallet = $2 OR wallet IS NULL)
       AND status = 'APPROVED'
     ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [candidate.id, wallet]
  );

  return approvalRes.rows[0] || null;
}

export async function findOrCreatePendingApproval(client, { candidate, wallet, actor, reason, metadata }) {
  const existing = await client.query(
    `SELECT * FROM approvals
     WHERE candidate_id = $1
       AND (wallet = $2 OR wallet IS NULL)
       AND status = 'PENDING'
     ORDER BY created_at DESC
     LIMIT 1`,
    [candidate.id, wallet]
  );

  if (existing.rows[0]) return existing.rows[0];

  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const inserted = await client.query(
    `INSERT INTO approvals (id, candidate_id, wallet, status, reason, requested_by, metadata)
     VALUES ($1, $2, $3, 'PENDING', $4, $5, $6)
     RETURNING *`,
    [id, candidate.id, wallet, reason, actor, metadata]
  );
  return inserted.rows[0];
}
