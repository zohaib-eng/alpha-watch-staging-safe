export const runtime = 'nodejs';

import { webcrypto, randomBytes } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { withDb } from '../../_lib/db';
import { createSessionToken } from '../../_lib/auth';

function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const char of value) {
    const carryStart = alphabet.indexOf(char);
    if (carryStart < 0) throw new Error('Invalid base58 value');
    let carry = carryStart;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char === '1') bytes.push(0);
    else break;
  }
  return Uint8Array.from(bytes.reverse());
}

function decodeSignature(signature) {
  try {
    return Uint8Array.from(Buffer.from(signature, 'base64'));
  } catch {
    return decodeBase58(signature);
  }
}

async function verifyEd25519({ wallet, message, signature }) {
  const publicKey = new PublicKey(wallet).toBytes();
  const key = await webcrypto.subtle.importKey(
    'raw',
    publicKey,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return webcrypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    decodeSignature(signature),
    new TextEncoder().encode(message)
  );
}

function roleForWallet(wallet) {
  const key = wallet.toLowerCase();
  const admins = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
  return admins.includes(key) ? 'admin' : 'operator';
}

export async function GET() {
  const nonce = randomBytes(18).toString('base64url');
  const message = [
    'Alpha Watch sign-in',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`
  ].join('\n');

  return await withDb(async client => {
    await client.query(
      `INSERT INTO auth_challenges (nonce, message, expires_at)
       VALUES ($1, $2, now() + interval '10 minutes')`,
      [nonce, message]
    );
    return Response.json({ nonce, message });
  });
}

export async function POST(request) {
  try {
    const { wallet, nonce, message, signature } = await request.json();
    if (!wallet || !nonce || !message || !signature) {
      return Response.json({ error: 'wallet, nonce, message, and signature required' }, { status: 400 });
    }

    return await withDb(async client => {
      const challengeRes = await client.query(
        `SELECT * FROM auth_challenges
         WHERE nonce = $1 AND message = $2 AND expires_at > now() AND used_at IS NULL`,
        [nonce, message]
      );
      const challenge = challengeRes.rows[0];
      if (!challenge) return Response.json({ error: 'Challenge expired or invalid' }, { status: 400 });

      const verified = await verifyEd25519({ wallet, message, signature });
      if (!verified) return Response.json({ error: 'Invalid wallet signature' }, { status: 401 });

      await client.query('UPDATE auth_challenges SET wallet = $1, used_at = now() WHERE nonce = $2', [wallet, nonce]);

      const role = roleForWallet(wallet);
      return Response.json({
        token: createSessionToken({ wallet, role }),
        wallet,
        role
      });
    });
  } catch (error) {
    console.error('Wallet auth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
