# Alpha Watch — staging-safe release candidate

This bundle wires:
- real Jupiter Swap API v2 quote/order/execute wrappers for Solana
- real 0x Swap API v2 price/quote wrappers for Base
- live execution **disabled by default**
- mandatory approvals
- dry-run and shadow-order modes
- deploy checklist for engineers

## Modes

- `dry-run`: fetch real quotes/orders, do not submit transactions
- `shadow-order`: fetch real quotes/orders and record what would be executed
- `live`: requires secrets, approvals, funded wallets, and staging signoff

## Safety defaults

- `TRADING_ENABLED=false`
- `MANDATORY_APPROVALS=true`
- `EXECUTION_MODE=dry-run`

## Quick start

1. Copy `.env.example` to `.env`
2. `docker compose up -d`
3. `npm install`
4. `npm run build`

## Deploy checklist

### Secrets
- [ ] Set `AUTH_SECRET`
- [ ] Set `JUPITER_API_KEY` if required by your tier
- [ ] Set `ZEROX_API_KEY`
- [ ] Set funded signer keys only in staging first
- [ ] Set dedicated RPC URLs for Solana and Base

### Staging validation
- [ ] Login works for approved operators
- [ ] Candidate scan succeeds
- [ ] Approval queue works
- [ ] Dry-run produces quotes/orders for Solana and Base
- [ ] Shadow-order logs exact route/price/minOut data
- [ ] Risk engine blocks disallowed candidates
- [ ] Kill-switch disables all execution paths

### Before enabling live
- [ ] Set `TRADING_ENABLED=true`
- [ ] Set `EXECUTION_MODE=live`
- [ ] Confirm mandatory approvals still enabled
- [ ] Confirm signer wallet limits and monitoring
- [ ] Run one low-size supervised trade per chain

## Notes

This is a **staging-safe** bundle, not an unattended live-trading release.


## Android / tablet support

- Capacitor Android wrapper added under `apps/mobile`
- Tablet-ready responsive layout and horizontal multi-tab shell added to the web app
- Android manifest configured with `resizeableActivity=true` for tablets and split-screen


## APK build support

- Android Gradle project scaffolding added under `apps/mobile/android`
- Root scripts added for debug/release APK and release AAB builds
- Engineers should generate the real Gradle wrapper in Android Studio or with `gradle wrapper` before CI/release builds
