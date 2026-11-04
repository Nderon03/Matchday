# MATCHDAY

**Your football. Your squad. Your statistics.**

MATCHDAY is a football organisation, statistics and social platform for groups of friends who play
5- to 11-a-side. Organise sessions, confirm attendance, build balanced teams on a tactical pitch,
record single or multi-game sessions, submit goals, vote for Man of the Match, rate each other, pay
session fees, and compete on career and group leaderboards.

One TypeScript codebase runs on **iOS, Android and the web** (Expo + React Native Web), backed by
**Supabase** (PostgreSQL with Row Level Security, Auth, Storage, Realtime, Edge Functions) and **Stripe Connect**.

---

## Contents

1. [Project structure](#project-structure)
2. [Architecture](#architecture)
3. [Getting started (local)](#getting-started-local)
4. [Supabase setup](#supabase-setup)
5. [Environment variables](#environment-variables)
6. [Authentication setup](#authentication-setup)
7. [Payments setup](#payments-setup)
8. [Notifications setup](#notifications-setup)
9. [Android build](#android-build) · [iOS build](#ios-build) · [Web deployment](#web-deployment)
10. [Testing](#testing)
11. [Feature status](#feature-status)
12. [Known limitations](#known-limitations)

Detailed references: [`docs/DATABASE.md`](docs/DATABASE.md) (schema, integrity rules, RLS, RPCs) and
[`docs/PAYMENTS.md`](docs/PAYMENTS.md) (UK payment model).

---

## Project structure

```
src/
  app/                       Expo Router routes (every file is a screen)
    (auth)/                  welcome, sign-in, sign-up, forgot-password
    (app)/                   signed-in area (auth + onboarding guard)
      (tabs)/                Home · Matches · Create · Leagues · Profile
      session/new, session/[id]/{index,lineup,results,goals,vote,payments,attendance,invite,edit}
      group/{new,discover}, group/[id]/{index,settings}
      player/[id], compare, friends, notifications, tasks, feed/[id], wrapped, payments, scan, settings/*
    auth/callback, reset-password, invite/[code], +not-found
  components/ui/             design-system primitives (Text, Button, Card, Input, Sheet, Toast, States…)
  components/football/       Pitch (drag & drop), Podium, Leaderboard, PlayerCard, ResultCard, FeedItem…
  features/                  larger composed views (SessionForm, PlayerProfileView, auth helpers)
  domain/                    pure, unit-tested logic: balancing, stats, MOTM, achievements, line-ups, validation
  hooks/                     React Query data hooks, realtime invalidation, actions
  lib/                       Supabase client, RPC/Edge-Function wrappers, errors, storage, sharing, push
  theme/                     design tokens (dark-first palette, type scale, spacing) + ThemeProvider
supabase/
  migrations/                SQL migrations (schema, RLS, business logic, stats, payments, scheduler)
  functions/                 Deno Edge Functions (Stripe Connect, checkout, host actions, webhook, cron, push, delete-account)
  tests/auth_stub.sql        Supabase platform stub for running migrations on plain PostgreSQL
  config.toml                local Supabase CLI config
  cron-edge-functions.sql    one-off SQL to schedule Edge Functions with pg_cron + pg_net
tests/db/                    database integration, security (RLS) and coverage tests
scripts/                     local DB reset, web smoke test, web visual check
docs/                        DATABASE.md, PAYMENTS.md
```

## Architecture

* **Frontend:** Expo SDK 58, React Native 0.88, React 19, TypeScript (strict), Expo Router, React Query.
  Dark-first design system with an Inter type scale, a light theme, reduced-motion support and responsive
  layouts (bottom tab bar with a prominent Create button on phones, sidebar on desktop, max-width content on wide screens).
* **Backend:** Supabase Postgres is the source of truth. **Business rules run in transactional
  `SECURITY DEFINER` functions** (attendance, waiting lists, line-ups, scoring, goal approval, voting,
  finalisation, statistics, seasons). Clients have read access scoped by RLS and can only write
  through those functions, apart from a few safe self-owned updates (profile, preferences, comments, reactions).
* **Statistics** are derived from verified records by an idempotent server function. Nothing stores
  editable totals (see `docs/DATABASE.md`).
* **Realtime:** Postgres changes (RLS-filtered) invalidate cached queries for sessions, line-ups,
  goal claims, payments, notifications and feeds.
* **Edge Functions** handle everything that needs secrets: Stripe, push delivery, account deletion.
* **Scheduling:** `process_session_deadlines()` (reminders, auto-finalise, recurring sessions) runs in
  pg_cron. `send-notifications` and `payments-cron` are called by pg_cron through pg_net.
* **Validation** is centralised in `src/domain/validation.ts` (zod) and mirrored by database constraints.
* **Errors:** database functions raise errors with a stable code in the `HINT` field plus a readable
  message. `lib/errors.ts` maps those and network failures to clear copy. Screens use shared
  loading/skeleton/empty/error/retry states. A root error boundary always offers a way home.

## Getting started (local)

Requirements: Node 22+, npm, a Supabase project (hosted or `supabase start` with Docker), optionally
the Supabase CLI and Deno.

```bash
npm install
```

```bash
cp .env.example .env   # then fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
```

```bash
npm run web            # or: npm run ios / npm run android (needs a development build, see below)
```

Without Supabase credentials the app shows a "Backend not configured" screen. It never falls back to fake data.

## Supabase setup

1. Create a project at supabase.com (create separate **development** and **production** projects).
2. Link and push the migrations:

   ```bash
   supabase link --project-ref <ref>
   ```

   ```bash
   supabase db push
   ```

   This creates every table, policy, function, the storage buckets (`avatars`, `group-images`,
   `share-cards`), the realtime publication and, when pg_cron is available, the 15-minute deadline job.
3. In **Database → Extensions**, make sure `pg_cron` and `pg_net` are enabled. If the scheduler migration
   ran before pg_cron was enabled, run `select cron.schedule('matchday-deadlines', '*/15 * * * *', 'select public.process_session_deadlines()');`.
4. Deploy the Edge Functions and set their secrets (see `supabase/functions/.env.example`):

   ```bash
   supabase functions deploy stripe-connect payments-checkout payments-host-action payments-cron send-notifications delete-account
   ```

   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   ```bash
   supabase secrets set --env-file supabase/functions/.env
   ```

   `payments-cron` and `send-notifications` authenticate with `CRON_SECRET`; `config.toml` disables JWT verification for them and for the webhook.
5. Run `supabase/cron-edge-functions.sql` once in the SQL editor (after replacing the placeholders) to
   schedule push/email delivery every minute and payment housekeeping every 15 minutes.
6. Optional: `npm run db:types` generates Supabase types if you want to replace the hand-written ones in `src/types/db.ts`.

Local development with Docker: `supabase start` then `supabase db reset` applies the migrations; use the printed API URL and anon key in `.env`.

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| App (`.env`, public) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase API (anon key only; RLS enforces access) |
| App | `EXPO_PUBLIC_APP_URL` | Web origin for shareable invite links (else `matchday://`) |
| App | `EXPO_PUBLIC_EAS_PROJECT_ID` | Expo push token project id (also read from `app.json` → `extra.eas.projectId`) |
| Functions (secrets) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| Functions | `APP_URL`, `ALLOWED_ORIGIN`, `PLATFORM_FEE_BPS` | Redirect URLs, CORS, optional platform fee |
| Functions | `CRON_SECRET` | Shared secret for scheduled functions |
| Functions | `EXPO_ACCESS_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM` | Optional push auth and email delivery |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by
Supabase. **The service-role key and Stripe secret key must never appear in the app or in `EXPO_PUBLIC_*` variables.**

## Authentication setup

* Email + password with **email verification** (`enable_confirmations = true`), password recovery,
  PKCE flow, session persistence and auto refresh. Usernames are checked live with `is_username_available`.
* In **Auth → URL configuration** add redirect URLs: `matchday://auth/callback`, your web origin
  `https://<your-domain>/auth/callback`, and `http://localhost:8081/auth/callback` for development.
* Customise the email templates (sign-up, reset) with MATCHDAY branding. Set up SMTP for production sending.
* **Optional OAuth (Google / Apple):** enable the provider in Supabase Auth and add the client id/secret
  (`config.toml` shows the local keys). The buttons on the sign-in screen work once a provider is enabled;
  before that they show "This sign-in method is not enabled yet."
* **Account deletion** runs through the `delete-account` Edge Function. It transfers group ownership,
  removes avatars and deletes the auth user (personal data cascades).

## Payments setup

See [`docs/PAYMENTS.md`](docs/PAYMENTS.md). In short: enable Stripe Connect (Express, UK), set
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, register the webhook endpoint with the listed events,
and schedule `payments-cron`. Hosts connect payouts in **Settings → Payouts**.

## Notifications setup

* **In-app notifications** are database rows (with realtime). They work as soon as Supabase is configured.
* **Push (Expo):** run `npx eas-cli@latest init` to get a project id (stored in `app.json`), and configure
  FCM credentials (Android) and an APNs key (iOS) with `eas credentials`. The app registers its Expo push
  token after onboarding. `send-notifications` delivers queued pushes every minute and prunes dead tokens.
  Push needs a physical device and a development or production build (not Expo Go web).
* **Email (optional):** set `RESEND_API_KEY` and `EMAIL_FROM`. Invites, waiting-list promotions and payment
  notices are emailed. Without a key they're marked as skipped.
* Users control push, email and each notification type in **Settings → Notifications**.

## Android build

Step-by-step guide (env variables, push credentials, devices): [docs/MOBILE_BUILD.md](docs/MOBILE_BUILD.md).

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --profile preview --platform android      # installable APK for testing
```

```bash
npx eas-cli@latest build --profile production --platform android    # Play Store AAB
```

Set `EXPO_PUBLIC_*` variables per profile in EAS (`eas env:create`) so production builds point at the
production Supabase project. Package id: `com.matchdayonline.app` (set in `app.config.js`; permanent once published).

## iOS build

```bash
npx eas-cli@latest build --profile preview --platform ios        # ad-hoc build for registered iPhones
```

```bash
npx eas-cli@latest build --profile production --platform ios
```

```bash
npx eas-cli@latest submit --platform ios
```

Requires an Apple Developer account. Bundle id: `com.matchdayonline.app` (set in `app.config.js`). Add your web domain to
`ios.associatedDomains` if you want universal links for invites.

## Web deployment

```bash
npm run build:web      # outputs a static single-page app to dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront) with an SPA
fallback rewriting all paths to `/index.html`. Set the `EXPO_PUBLIC_*` variables at build time, and add
the deployed origin to Supabase Auth redirect URLs and `APP_URL`.

## Testing

| Command | What it covers |
|---|---|
| `npm run typecheck` | Strict TypeScript across the app and tests |
| `npx eslint .` | Expo ESLint config including React Compiler rules |
| `npm run test:unit` | 81 unit tests: team balancing, win %, session/career ratings, form, improvement, streaks, multi-fixture summaries, MOTM ties, achievements, leaderboard ranking, line-up operations, validation, formatting, **Stripe webhook signature verification**, payment status transitions, upfront window, push batching |
| `npm run test:db` | 27 database tests against real migrations with RLS enforced: full single-match journey (registration → friends → group → session → attendance/waiting list → line-ups → score → goals → approvals → MOTM → ratings → finalise → stats → leaderboards → achievements → feed); multi-fixture journey with changing teams, fixture breakdowns, shared MOTM, audited correction and late claims; seasons, awards, records, head-to-head, Wrapped, auto-finalise and recurring sessions; security (self-votes, duplicates, absent voters, deadlines, anonymous ballots, result/score tampering, goal-approval rights, payment status tampering, private profiles/groups, blocks, roles, expired invites, rate limits, internal-function grants); and a coverage suite calling every remaining RPC |
| `deno check supabase/functions/*/index.ts` | Type-checks all Edge Functions |
| `npm run build:web` | Production web build |
| `npm run e2e:web` | Chromium smoke test of the built web app at 375 px and 1366 px: renders public screens, checks client validation, fails on runtime errors or horizontal overflow, saves screenshots |
| `node scripts/e2e-web-visual.mjs` | Layout check of signed-in screens (home, session, pitch, leagues, profile, create) at both sizes. Uses canned API responses, so it verifies rendering only |

`npm run test:db` needs a local PostgreSQL. It defaults to `postgresql://postgres:postgres@localhost:5432`;
override with `PGURL` / `PGURL_BASE`. CI (`.github/workflows/ci.yml`) runs all of the above.

## Feature status

**Implemented and covered by automated tests:**
accounts, onboarding and profiles; username checks; friends (search, requests, remove, block, invite
links and QR codes); groups (public/private, open/request/invite-only, roles, join requests, discovery,
settings, moderation); sessions (5–11-a-side, templates, recurring schedules, repeat last session,
invitations, RSVP, unavailable, waiting list with auto-promotion, withdrawal deadline, co-hosts);
check-in and host verification (absent, late, replacement); line-ups (drag and drop, tap actions, GK,
substitutes, positions, balanced and random suggestions based on group history and recent pairings);
single and multi-fixture sessions (keep / balance / randomise / manual for the next game); scores;
goal and assist claims with optional per-game breakdown, host approve/reject/correct/clarify, bulk
approval, host entry, late claims and reminders; anonymous MOTM (session or per game, shared ties or
host tie-break) and 1–10 ratings with eligibility thresholds; finalisation, derived statistics,
career/group records, form, streaks, rating history, teammates, head-to-head and rivalries;
leaderboards (10 categories, podium, full paginated table, group/friends/global, all-time/month/year/season,
minimum appearances); seasons and awards; achievements; activity feed with reactions, comments and
replies; record book; Wrapped; pending tasks; in-app notifications with preferences; scheduler
(reminders, auto-finalise, recurring sessions); audit log; rate limiting; privacy controls; light/dark
themes; responsive web.

**Implemented, but needs external credentials or provider approval before it can be switched on:**

| Integration | Needs |
|---|---|
| Stripe Connect payments (onboarding, checkout, capture/release, refunds, webhooks) | Stripe account with Connect enabled for the UK, secret key, webhook secret. Logic is unit-tested; **not run against live Stripe** |
| Push notifications | EAS project id, FCM/APNs credentials, a physical device build |
| Email notifications | Resend API key and a verified sending domain |
| Google / Apple sign-in | Provider credentials configured in Supabase Auth |
| Account deletion, payout status | Deployed Edge Functions (service role) |
| Scheduled push/email/payment jobs | `pg_net` + `pg_cron` and `supabase/cron-edge-functions.sql` |

## Known limitations

* **Upfront payments open 6 days before kick-off**, because card authorisations expire after about 7 days.
  If the host doesn't confirm within 24 hours, holds are released, not captured (see `docs/PAYMENTS.md`).
* **Goalkeepers:** keepers are players whose preferred position is Goalkeeper. With 1 keeper the other team
  rotates in goal and is compensated; with none, everyone rotates. There are no keeper-specific stats
  (clean sheets), because in casual games keepers usually rotate.
* **Add to calendar** uses a Google Calendar link on phones, plus an .ics file on the web. One-tap Apple
  Calendar comes with the iOS build.
* **Email links** open the website, which offers "Open the MATCHDAY app". Android App Links / iOS Universal
  Links (opening the app directly) need a native build.
* **Social sign-in** (Google/Apple) is hidden until configured (`EXPO_PUBLIC_OAUTH_PROVIDERS`).
* **Find a game** searches the venue/area text hosts type (no maps or distance).
* **Sharing:** player cards, results and Wrapped are shared as images; achievements and season awards as text.
* **Offline:** reads are cached and refetched on reconnect; changes need a connection.
* **Times in notifications** are formatted in Europe/London.
* **Global leaderboard** only includes players whose profile and stats are public.
