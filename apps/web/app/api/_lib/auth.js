import { createHmac, timingSafeEqual } from 'node:crypto';

function splitEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function sessionSecret() {
  return process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32
    ? process.env.AUTH_SECRET
    : 'local-dev-alpha-watch-secret-please-change';
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken({ wallet, role, ttlSeconds = 60 * 60 * 8 }) {
  const payload = base64url(JSON.stringify({
    wallet,
    role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getActor(request) {
  const headers = request?.headers;
  const bearer = headers?.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = verifySessionToken(bearer);
  const wallet = headers?.get('x-alpha-wallet') || headers?.get('x-wallet') || null;
  const sessionWallet = session?.wallet || null;
  const effectiveWallet = sessionWallet || wallet;
  const requestedRole = (session?.role || headers?.get('x-alpha-role') || 'operator').toLowerCase();
  const actor = (headers?.get('x-alpha-actor') || effectiveWallet || 'local-operator').toLowerCase();

  const adminAllowlist = splitEnv('ADMIN_WALLETS');
  const operatorAllowlist = splitEnv('OPERATOR_WALLETS');
  const isProduction = process.env.NODE_ENV === 'production';
  const localFallbackAllowed = !isProduction && adminAllowlist.length === 0 && operatorAllowlist.length === 0;
  const walletKey = effectiveWallet?.toLowerCase();
  const actorAllowedAsAdmin = walletKey && adminAllowlist.includes(walletKey);
  const actorAllowedAsOperator =
    actorAllowedAsAdmin ||
    (walletKey && operatorAllowlist.includes(walletKey)) ||
    Boolean(session) ||
    localFallbackAllowed;

  return {
    id: actor,
    wallet: effectiveWallet,
    role: actorAllowedAsAdmin || (localFallbackAllowed && requestedRole === 'admin') ? 'admin' : 'operator',
    localFallbackAllowed,
    isAllowed: actorAllowedAsOperator
  };
}

export function requireOperator(request) {
  const actor = getActor(request);
  if (!actor.isAllowed) {
    return {
      actor,
      response: Response.json({ error: 'Operator is not allowlisted' }, { status: 403 })
    };
  }
  return { actor };
}

export function requireAdmin(request) {
  const { actor, response } = requireOperator(request);
  if (response) return { actor, response };
  if (actor.role !== 'admin') {
    return {
      actor,
      response: Response.json({ error: 'Admin role required' }, { status: 403 })
    };
  }
  return { actor };
}
