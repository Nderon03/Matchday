# Building the phone apps (EAS)

Builds run in Expo's cloud, so iOS builds work from Windows too.

| Profile | What you get |
| --- | --- |
| `preview` | A standalone app for testing on your own phones: an `.apk` for Android, an ad-hoc build for registered iPhones. |
| `production` | Store builds (`.aab` for Google Play, App Store build for TestFlight/App Store). |

## Environment variables (EAS → project → Environment variables)

The `.env` file is not uploaded to the build, so set these for the `preview` (and later `production`) environment,
visibility **Plain text**:

* `EXPO_PUBLIC_SUPABASE_URL`
* `EXPO_PUBLIC_SUPABASE_ANON_KEY`
* `EXPO_PUBLIC_APP_URL` (the public web address used in invite links, e.g. `https://matchday-online.netlify.app`)
* `EXPO_PUBLIC_SENTRY_DSN` (crash reporting; from Sentry → project → Client Keys)

## Push notifications

* **Android:** Firebase project → add an Android app with package `app.matchday.android` → download
  `google-services.json` into the project root (or upload it as an EAS *file* variable named `GOOGLE_SERVICES_JSON`).
  Then Firebase → Project settings → Service accounts → *Generate new private key*, and upload that JSON with
  `eas credentials` → Android → Google Service Account → *FCM V1*.
* **iOS:** needs the Apple Developer Program. During `eas build`, log in with your Apple ID and let EAS create the
  push key (APNs) and certificates.
* The `send-notifications` Edge Function must be scheduled (see `supabase/cron-edge-functions.sql`).

## Commands

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest device:create          # iPhone: register each test device
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

## Over-the-air updates (EAS Update)

Builds include `expo-updates` on the channel named after their profile (`preview`, `production`).
Screen and logic changes reach installed apps without a reinstall:

```bash
npx eas-cli@latest update --channel preview --environment preview --message "What changed"
```

Phones download it in the background and switch to it the next time the app comes back to the
foreground. The runtime version uses the **fingerprint** policy: if native code changes (new native
package, permission, icon, app name), the update won't be sent to old builds and you need a new
`eas build` instead.
