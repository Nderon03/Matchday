# Google Play: "Set up your app" answers

App: **MATCHDAY** · package `com.matchdayonline.app` · free · UK only.
Play Console → your app → **Dashboard** → *Set up your app*. Each item below matches a task there.

---

## 1. Privacy policy
`https://matchdayapp.org/legal/privacy`

## 2. App access
**All or some functionality in my app is restricted** → add instructions:
- Name: `Reviewer account`
- Username / email and password: a test account you create **after switch-over** (e.g. `matchdayenquiries+review@hotmail.com`), already onboarded, in a group with a past session so reviewers see stats.
- Instructions:
  > Sign in with the account above. The app organises casual football: open the group "MATCHDAY Review FC" to see sessions, line-ups, results and stats. Payments go to the host's Stripe account and are only needed to join paid sessions; no payment is required to review the app.

## 3. Ads
**No, my app does not contain ads.**

## 4. Content rating (IARC questionnaire)
- Email: `matchdayenquiries@hotmail.com` · Category: **All other app types** (or *Social / Communication* if offered)
- Violence, fear, sexuality, language, drugs, gambling: **No** to all
- **Users can interact or exchange content:** **Yes** (comments, group invites)
- Shares user's location with other users: **No** (venues are typed text, not GPS)
- Allows purchase of digital goods: **No** (payments are for real-world football sessions)
- Unrestricted internet / web browser: **No**

Expected result: a low age rating with a "Users interact" notice.

## 5. Target audience and content
- Target age groups: **16–17** and **18 and over** (the app is 16+)
- Could the app unintentionally appeal to children? **No**
- No ads → nothing else to declare

## 6. News app
**No**

## 7. Data safety
**Does your app collect or share user data?** Yes, collects. **Shared with third parties:** No (Supabase, Stripe, Expo, Sentry and Resend are *service providers*, which Google doesn't count as sharing).
**Is all data encrypted in transit?** Yes. **Can users request deletion?** Yes → URL `https://matchdayapp.org/legal/delete-account`.

| Data type (Play's names) | Collected | Required? | Purposes |
|---|---|---|---|
| Personal info → **Name** | ✅ | Required | App functionality, Account management |
| Personal info → **Email address** | ✅ | Required | App functionality, Account management, Developer communications |
| Personal info → **User IDs** | ✅ | Required | App functionality, Account management |
| Financial info → **Purchase history** | ✅ | Optional | App functionality (session payments, receipts) |
| Photos and videos → **Photos** | ✅ | Optional | App functionality (profile photo, group logo) |
| App activity → **App interactions** | ✅ | Required | App functionality (attendance, stats, votes) |
| App activity → **Other user-generated content** | ✅ | Optional | App functionality (comments, bio) |
| App info and performance → **Crash logs** | ✅ | Required | App functionality, Analytics |
| App info and performance → **Diagnostics** | ✅ | Required | App functionality, Analytics |
| Device or other IDs | ✅ | Required | App functionality (push notifications) |

**Not collected:** location, contacts, messages, health, calendar, files, audio, web history, payment card details (entered on Stripe's own page, never in the app).
Data processed ephemerally? **No** for all of the above.

## 8. Government apps
**No**

## 9. Financial features
**My app doesn't provide any financial features** (taking payment for football sessions isn't a financial service).

## 10. Health apps
**No / not a health app**

---

## Store settings
- **App category:** Sports
- **Tags:** Sports, Football (soccer), Team management, Social
- **Contact email:** `matchdayenquiries@hotmail.com` · **Website:** `https://matchdayapp.org`
- **Countries:** **United Kingdom only** (Production → Countries/regions). Keeps it simple and avoids EU trader-address display.

## Main store listing
**App name (30):** `MATCHDAY: Football Organiser`

**Short description (80):**
> Organise 5-a-side: invites, line-ups, results, stats, MOTM votes and payments.

**Full description (4000):**
> MATCHDAY makes running your weekly football game effortless.
>
> **Get the squad together**
> • Create a group for your regular game and invite friends by link or QR code
> • Players tap "I'm in" or "Can't make it" – with a waiting list when it's full
> • Bring a guest, with the host's approval
> • Kick-off reminders so nobody forgets
>
> **Pick the teams**
> • Drag-and-drop line-ups on a pitch
> • Balanced teams suggested from players' ratings and form
> • Players are notified when the teams are confirmed
>
> **After the final whistle**
> • Record scores, goals and assists – game by game
> • Vote for Man of the Match and rate teammates anonymously
> • Watch the game back when the host adds a YouTube video
>
> **Stats that settle arguments**
> • Goals, assists, wins, ratings, MOTM awards and form
> • Group leaderboards and seasons
> • Compare any two players head to head
>
> **Payments without the chasing**
> • Hosts set a price; players pay by card, Apple Pay or Google Pay
> • Pay upfront (card held until the game happens) or after the game
> • Unpaid? Settle up before joining the next game
> • Optional late fines for groups that want them
> • Money goes straight to the host via Stripe
>
> Free to download. A small booking fee is shown before you pay for paid sessions.

## Graphics
- **App icon (512×512):** `assets/store/play-icon-512.png`
- **Feature graphic (1024×500):** `assets/store/feature-graphic-1024x500.png`
- **Phone screenshots (2–8, at least 1080px tall):** take on your phone after switch-over, using real-looking groups: home, session page, line-up pitch, results/stats, leaderboard, payment screen.
