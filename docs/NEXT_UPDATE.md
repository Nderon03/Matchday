# Next native build

Things that need a **new native build** (they add native code, so they can't go out as an
over-the-air update). The code below is done and tested; one build ships it all.

## Ready in this build
- [x] **Match sounds** (`expo-audio`): our own synthesised sounds in `assets/sounds` (full-time whistle,
  goal, medal unlock, "I'm in"), played with the matching haptic. Settings → Sounds (on by default),
  never in silent mode, doesn't stop music. No microphone permission.
- [x] **"Rate MATCHDAY"** (`expo-store-review`): Google's in-app rating card after a happy moment
  (winning the award, a medal / card unlock, a match reveal with a win), from the 2nd such moment,
  at most once every 4 months (`src/lib/review.ts`).
- [x] **One-tap add to calendar** (`expo-calendar`): the game goes straight into the phone's calendar
  with a reminder 2 hours before (falls back to the Google Calendar link). Asks for calendar permission.
- [x] **Google's own account picker** (`@react-native-google-signin/google-signin`) for "Continue with
  Google" on Android. Only on when `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set (step 2 below); any problem
  falls back to the browser sign-in automatically, so sign-in can't break.
- [x] **Readable native crash reports in Sentry** (`SENTRY_AUTH_TOKEN` is set in EAS).

## Later builds
- [ ] **iPhone build**, TestFlight and **Sign in with Apple** (required by the App Store when Google
  sign-in is offered), once the Apple developer account is active.
- [ ] **App links** (invite links open the app directly): needs the app signing key's SHA-256 from Play
  Console and an `assetlinks.json` on matchdayapp.org.

## Setup on your side (before building)
1. **Google Cloud** → APIs & Services → Credentials → **Create credentials → OAuth client ID →
   Android**: package name `com.matchdayonline.app`, SHA-1 from Play Console → Test and release →
   App integrity → **App signing key certificate**. (No need to copy anything from it.)
2. **EAS**: the *Web* OAuth client ID you already made for Supabase (Supabase → Authentication →
   Providers → Google → Client ID). On your PC:
   `npx eas-cli@27.3.0 env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> --environment production --visibility plaintext`
3. **Supabase** → Authentication → Providers → Google: turn on **Skip nonce checks** (Android's
   picker doesn't send one).

## Build and release
1. `git pull` then `npm install` (new packages).
2. `npx eas-cli@27.3.0 build --profile production --platform android`
3. Play Console → Test and release → your closed test → **Create new release** → upload the `.aab`
   from the build page → release notes → Save → Review → Start rollout.
4. Testers get it as a normal Play Store update. From then on, over-the-air updates only reach this new
   build, so ask testers to update.
