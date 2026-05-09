import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceRisk } from '../apps/worker/src/services/risk.js';
import { createSessionToken, verifySessionToken } from '../apps/web/app/api/_lib/auth.js';

test('worker risk accepts DB snake_case candidate fields', () => {
  assert.doesNotThrow(() => enforceRisk({
    score: 90,
    liquidity_usd: 500000,
    arb_gap_pct: 1
  }, 100));
});

test('worker risk rejects oversized trades', () => {
  assert.throws(() => enforceRisk({
    score: 90,
    liquidity_usd: 1000,
    arb_gap_pct: 1
  }, 100), /Insufficient liquidity|Size too large/);
});

test('auth session token round trips and rejects tampering', () => {
  process.env.AUTH_SECRET = '12345678901234567890123456789012';
  const token = createSessionToken({ wallet: 'Wallet111111111111111111111111111111111', role: 'admin' });
  const session = verifySessionToken(token);
  assert.equal(session.wallet, 'Wallet111111111111111111111111111111111');
  assert.equal(session.role, 'admin');
  assert.equal(verifySessionToken(`${token}x`), null);
});
