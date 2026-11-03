# Switch-over day: test → live

Do these in order, in one sitting. After step 3 the app takes **real money** and has **no accounts**.
Everything else (domain, email, Sentry, Play Console setup, Stripe verification) is already done.

## 0. Before you start
- [ ] Supabase plan: staying on **Free** for now (weekly backups via GitHub, see `docs/BACKUPS.md`). Upgrade to **Pro** once real money flows every week or before the public launch: no pausing after a quiet week, daily backups.
- [ ] Laptop: `git pull` then `npm install`.
- [ ] Have ready: Stripe dashboard (live), Supabase dashboard, your reviewer email + password (from Play Console → App access).

## 1. Stripe live keys (Supabase secrets)
1. Stripe (live, no "Sandbox" bar) → **Developers → API keys** → **Secret key → Reveal** → copy `sk_live_…`.
2. `npx supabase@latest secrets set STRIPE_SECRET_KEY=sk_live_…`  (never paste it anywhere else)

## 2. Stripe live webhooks
Stripe (live) → **Developers → Webhooks → Add destination**. Endpoint URL for both:
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

**Destination A – "Your account"** events:
`checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`

**Destination B – "Connected accounts"** events: `account.updated`

Copy each destination's **signing secret** (`whsec_…`), then (comma-separated, no spaces):
`npx supabase@latest secrets set "STRIPE_WEBHOOK_SECRET=whsec_A,whsec_B"` (keep the quotes: in PowerShell an unquoted comma splits the value)

## 3. Wipe all test data
1. Supabase → **SQL Editor** → paste `supabase/scripts/wipe-test-data.sql` → **Run** → counts must be 0.
2. Supabase → **Storage** → each bucket (avatars, group logos) → select all → delete.

## 4. Turn on email confirmation
Supabase → **Authentication → Sign In / Providers → Email** → **Confirm email: ON** → Save.
**Authentication → Emails → Templates → Confirm signup**: subject `Confirm your MATCHDAY account`, body = `supabase/templates/confirm-signup.html` (already done for Reset password).

## 5. Production Android build
1. Check `google-services.json` contains `com.matchdayonline.app` (`findstr matchdayonline google-services.json`).
2. `npx eas-cli@latest build --profile production --platform android`
   - "Generate a new Android Keystore?" → **Yes** (new app ID).
   - Produces an **.aab** for Google Play (not installable directly).
3. Optional, to have it on your phone now: `npx eas-cli@latest build --profile preview --platform android`,
   uninstall the old MATCHDAY, install the new one.

## 6. Real accounts
1. Sign up as **yourself** (real email → confirm via the email link). Complete onboarding.
2. **Settings → Payouts** → set up Stripe payouts with your **real** bank details (live).
3. Sign up the **reviewer account** (`matchdayenquiries+review@hotmail.com` + the password you gave Google) → confirm email.
4. As yourself: create group **"MATCHDAY Review FC"**, add the reviewer; create one **free** upcoming session
   (reviewer invited) and one **free** past session with a result, so reviewers see stats.

## 7. Real-money test (£1)
1. Create a paid session, price **£1**, pay-after or upfront; have a friend (or a second account with a real card) join and pay.
2. Check: player sees "Payment received", host dashboard shows paid, Stripe (live) shows the payment
   and a transfer to your connected account.
3. Refund it from the host dashboard → status "refunded".

## 8. Google Play closed test
1. Play Console → **Testing → Closed testing → Create track** (e.g. "Friends").
2. **Countries/regions:** United Kingdom.
3. **Testers:** add an email list (at least **12** Google accounts that will stay opted in for **14 days**).
4. **Create release** → upload the `.aab` from step 5 (download from expo.dev → Builds) → release notes
   "First test release" → **Review and roll out**.
5. Store listing → add **2–8 phone screenshots** (home, session, line-up, stats, leaderboard, payment).
6. Send testers the **opt-in link** (Closed testing → Testers). They opt in, then install from Google Play.
7. After 14 days with ≥12 testers: **Apply for production access** in the Dashboard.

## 9. Netlify on `main` (optional tidy-up)
When ready, merge the development branch into `main` and switch Netlify's production branch to `main`.
