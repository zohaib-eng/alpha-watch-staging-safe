import { getActor } from '../../_lib/auth';

export async function GET(request) {
  const actor = getActor(request);
  return Response.json({
    id: actor.id,
    wallet: actor.wallet,
    role: actor.role,
    isAllowed: actor.isAllowed,
    localFallbackAllowed: actor.localFallbackAllowed,
    allowUnlistedOperators: actor.allowUnlistedOperators,
    hasAdminAllowlist: Boolean(process.env.ADMIN_WALLETS),
    hasOperatorAllowlist: Boolean(process.env.OPERATOR_WALLETS)
  });
}
