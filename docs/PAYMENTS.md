# Payments (Stripe Connect, UK)

MATCHDAY never stores or transmits card data and never holds customer funds.

## Model

* **Connected accounts:** each host onboards a Stripe **Express** account (`country: GB`,
  `card_payments` + `transfers`). Stripe performs identity verification (KYC) and manages payouts to
  the host's bank. Onboarding status (`charges_enabled`, `payouts_enabled`) is synced via the
  `account.updated` webhook and the `stripe-connect` function.
* **Destination charges** via **Stripe Checkout**: the PaymentIntent is created on the platform with
  `transfer_data.destination = host account`, so funds settle to the host's connected balance.
  An optional platform fee is taken with `application_fee_amount` (`PLATFORM_FEE_BPS`, default 0).
* Checkout is hosted by Stripe and works identically on iOS, Android (in-app browser) and web, so no
  native Stripe SDK is needed.

## Mode A — pay upfront (authorise now, capture after the game)

The brief asked for funds to be held until the host confirms the session took place. Building our
own escrow would mean holding customer funds, so MATCHDAY uses Stripe's supported **manual capture**
instead:

1. Player confirms attendance, then pays → Checkout with `capture_method: manual`. The card is
   **authorised, not charged** (`payment_intent.amount_capturable_updated` → status `authorised`, amber clock).
2. Host taps **“Yes — confirm & collect”** after kick-off (`payments-host-action` → `mark_host_confirmed`).
   Authorisations for verified players are **captured** (→ `payment_intent.succeeded` → `paid`, green tick);
   holds for players marked absent are **released** (cancelled, never charged).
3. **Fallback if the host does not confirm within 24 h of the scheduled end:** `payments-cron` releases
   every outstanding hold — players are not charged and nothing is retained. The host is notified and can
   still confirm later; released holds for verified players are then converted into **pay-after requests**.
4. Card authorisations last up to 7 days, so upfront payment opens **6 days before kick-off**
   (`UPFRONT_WINDOW_HOURS`). Earlier attempts get a clear message saying when the window opens.

## Mode B — pay after the session

When the host completes the session, `complete_session` creates an `unpaid` payment row for every
verified non-host player and sends a payment request. Players pay through Checkout with automatic capture.

## Status integrity

* Status changes to `authorised`, `paid`, `failed`, `cancelled`, `refunded`, `partially_refunded` and
  `disputed` happen **only** in the `stripe-webhook` function after **signature verification**
  (HMAC-SHA256, 5-minute tolerance, implemented with WebCrypto and unit-tested against real
  Stripe-generated signatures).
* Every event is stored once in `payment_events` (unique Stripe event id → idempotent).
* Transitions never regress (`shouldTransition`), so out-of-order webhooks are harmless.
* Clients cannot write `payments` at all (RLS). Clicking “Pay” only creates a `pending` row server-side.
* Hosts may record a **cash** payment; it is shown as cash and audited.

## Refunds, cancellations and disputes

* Host refunds (full/partial) use `reverse_transfer` + `refund_application_fee`, so the money comes back
  from the host's connected account. Authorised-only payments are released rather than refunded.
* Cancelled sessions: `payments-cron` releases holds and refunds captured payments automatically.
* Disputes: `charge.dispute.created` marks the payment `disputed`; Stripe handles the dispute process
  with the connected account.

## Setup

1. Create a Stripe account, enable **Connect** (Express) for the UK, and set your platform profile.
2. Set function secrets (`supabase secrets set …`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `APP_URL` (web origin or `matchday://`), optional `PLATFORM_FEE_BPS`, `CRON_SECRET`.
3. Add a webhook endpoint → `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, listening to
   **both** account and connected-account events:
   `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.amount_capturable_updated`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
   `charge.refunded`, `charge.dispute.created`, `account.updated`.
4. Schedule `payments-cron` (see `supabase/cron-edge-functions.sql`).
5. Test with Stripe test cards (`4242 4242 4242 4242`) and `stripe listen --forward-to …/stripe-webhook`.

**Status in this repository:** the integration is implemented and its pure logic is unit-tested, but it
has **not** been run against a live Stripe account (no credentials were available). Do a full test-mode
run before going live, and confirm Connect eligibility and terms for your business with Stripe.
