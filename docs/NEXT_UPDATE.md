# First big update (new build)

Things that need a **new native build**, so they can't go out as an over-the-air update. Ship them
together in one build, either once Apple approves the developer account or before applying for
production access, whichever comes first. Keep the closed test stable until then.

## In the build
- [ ] **Sign in with Google and Apple** (Supabase Auth, no Clerk).
  - Buttons: "Continue with Google" / "Continue with Apple" on the last intro slide and the sign-in screen.
    New users still choose a username and accept the terms in onboarding.
  - Apple requires Sign in with Apple on iPhone if Google sign-in is offered.
  - A browser-based version already exists behind `EXPO_PUBLIC_OAUTH_PROVIDERS` (`src/features/auth.ts`).
    Upgrade it to native sign-in sheets (`expo-apple-authentication`, Google Sign-In via
    `signInWithIdToken`) for a one-tap flow.
  - Same email as an existing password account → should go into the same account (check before release).
- [ ] **App links**: email and invite links open the app directly (Android App Links / iOS Universal Links,
  served from matchdayapp.org).
- [ ] **One-tap add to calendar** on phones (`expo-calendar`) instead of the Google Calendar link.
- [ ] **iPhone build** and TestFlight.
- [ ] **Match sounds** (`expo-audio`, needs the new build): a soft whistle at full time, a crowd swell on the
  MOTM reveal and a ball thud on "I'm in", with a Sound switch next to Vibration in Settings (off when the
  phone is on silent). Not added before this build because a new native module stops over-the-air updates
  reaching the build testers already have.
- [ ] **Google's native account picker** (`@react-native-google-signin/google-signin`) instead of the browser sheet.
- [ ] **Sign in with Apple** (native sheet on iPhone; required by the App Store when Google sign-in is offered).

- [ ] **Ask for a Play Store review** (`expo-store-review`, needs the new build): Google's in-app rating card,
  shown at a happy moment (after a win, a MOTM award or a card level-up), at most once every few months.
  Ratings and reviews are a big part of how high MATCHDAY shows in Play Store search.

- [ ] **Readable native crash reports in Sentry**: builds upload debug symbols when the EAS
  environment has `SENTRY_AUTH_TOKEN` (see "Setup on your side"). Without it, native crashes (like
  the SIGSEGV on a Galaxy A5 / Android 7) show only "?" frames.

## Setup on your side
0. **Sentry token (once):** sentry.io → Settings → Auth Tokens (or Organization Tokens) → create a
   token with project:releases and project:write. Then, on your PC (never paste it in chat):
   `npx eas-cli@27.3.0 env:create --name SENTRY_AUTH_TOKEN --value <token> --environment production --visibility secret`
1. **Google Cloud** → APIs & Services → Credentials → create OAuth client IDs:
   - **Web** (used by Supabase), with redirect `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Android**, package `com.matchdayonline.app`, SHA-1 from Play Console → Test and release →
     App integrity → **App signing key certificate**.
   - **iOS**, bundle ID `com.matchdayonline.app` (once the Apple account is active).
2. **Apple Developer** → Certificates, IDs & Profiles: enable Sign in with Apple on the app ID, and create
   a Services ID and a key for Supabase.
3. **Supabase** → Authentication → Sign In / Providers → turn on **Google** and **Apple** and paste the IDs
   and keys. Add the app's redirect URL under URL Configuration.
4. Build: `npx eas-cli@27.3.0 build --profile production --platform all`.

## Release
- Android: upload the `.aab` as a new release on the closed test track (or production once approved).
  Testers get it as a normal Play Store update; they stay opted in and keep their data.
- Ask testers to update: over-the-air updates only reach the newest build from then on.
- Bump `LEGAL_VERSION` only if the privacy policy changes. It needs Google and Apple listed as sign-in
  providers, and the Play Data safety form stays the same.
