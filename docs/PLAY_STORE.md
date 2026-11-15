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
> Run your weekly game: no chasing money, no no-shows. Plus stats & player cards.

**Full description (4000):**
> Stop chasing money and players. MATCHDAY runs your regular football game: five-a-side on a Tuesday night, a 7-a-side league, an 11-a-side Sunday kickabout. Players pay before kick-off, drop-outs fill themselves, and everyone gets ratings, stats and a player card that levels up.
>
> **Never chase money again**
> • Set a price; players pay by card, Apple Pay or Google Pay when they join
> • Upfront: the card is held and only charged once the game happens. Or ask after the game
> • Unpaid? Players settle up before they can join the next game
> • Money goes straight to you via Stripe. Optional late fines if your group wants them
>
> **No more 9-a-side**
> • A waiting list fills drop-outs automatically, even at the last minute
> • "Need players" finds a sub in one tap
> • Reliability scores show who actually turns up
> • Kick-off reminders with the weather forecast
>
> **Get the squad together**
> • Create a group and your first game in a minute, then send one WhatsApp link
> • One tap on the link and players are in the game (and the group)
> • Bring a guest, with the host's approval
> • Kick-off reminders with the weather forecast
> • Last-minute drop-out? The place is offered down the waiting list automatically
> • Reliability scores, so hosts know who turns up
>
> **Matchday mode**
> • On the day, the app switches to a floodlit countdown to kick-off, then LIVE, then FULL TIME
>
> **Pick the teams**
> • Balanced teams suggested from players' ratings and form
> • Drag-and-drop line-ups on a pitch, for any format
> • Players are notified when the teams are confirmed
>
> **After the final whistle**
> • Record scores, goals and assists, game by game
> • Vote for Man of the Match and rate teammates anonymously
> • Watch the game back when the host adds a YouTube video
>
> **Stats that settle arguments**
> • Goals, assists, wins, ratings, MOTM awards and form
> • Your player card with your flag, your club and your rating, levelling up from Bronze to Hall of Fame
> • Medals, titles and new card styles to unlock
> • The Matchday Dream Team every month, the Golden Boot and the Record Book
> • Best partner, nemesis and head-to-heads
> • Share results and your card straight to the group chat
>
> **Ranked seasons**
> • Every three months, the race for Player of the Season
> • Ranked titles (Champion, Elite, Contender…) and a Season Wrapped to share
>
> Free to download. A small booking fee is shown before you pay for paid games.
>
> MATCHDAY is made by Ned's Games. It's an independent app and isn't affiliated with The Football Association or England Football.

## Graphics
- **App icon (512×512):** `assets/store/play-icon-512.png`
- **Feature graphic (1024×500):** `assets/store/feature-graphic-1024x500.png`
- **Phone screenshots (1080×1920):** `assets/store/screenshots/01-home.png` … `07-payments.png` (upload all 7) (regenerate with `STORE_SHOTS=1 node scripts/e2e-web-visual.mjs` then `node scripts/generate-store-screenshots.mjs <raw dir>`).
