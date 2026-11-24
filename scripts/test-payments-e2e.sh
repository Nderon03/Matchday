#!/usr/bin/env bash
# Payment rehearsal: the real Edge Functions (checkout, Stripe webhook, host actions, cron) running in
# Deno against the local test database, with a fake Stripe. See tests/payments-e2e/payments.test.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${SKIP_DB_RESET:-}" ] || ./scripts/db-reset-local.sh >/dev/null
npx -y deno@2 test --allow-all --no-lock --config supabase/functions/deno.json tests/payments-e2e/ "$@"
