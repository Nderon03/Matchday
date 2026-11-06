/** In-app Help & FAQ (also public at /help). Keep answers in step with how the app behaves. */
export interface HelpItem { q: string; a: string }
export interface HelpSection { id: string; title: string; items: HelpItem[] }

export const HELP: HelpSection[] = [
  {
    id: 'playing',
    title: 'Playing',
    items: [
      { q: 'How do I join a game?', a: 'Open the invite link or scan the QR code the host shares, or use Find a game to search public games near a postcode. Then tap “I’m in”.' },
      { q: 'What happens if the game is full?', a: 'You go on the waiting list. More than 24 hours before kick-off you move up automatically when a place opens. On the day, the next player is offered the place and has 30 minutes to tap “I’m in” before it goes to the next person.' },
      { q: 'I can’t make it any more', a: 'Open the session and tap “Can’t make it”, so the next player gets your place. You can do this until 24 hours before kick-off. After that, tap “Can’t make it” to tell the host: they take you off, but it counts against your reliability.' },
      { q: 'What is reliability?', a: 'How often you turn up after saying you’re in. No-shows and dropping out in the last 24 hours count against it. It shows once you’ve played 5 games, and players on 100% over 10 or more games get a special badge on their card.' },
      { q: 'Can I bring a friend?', a: 'Yes: tap “Add a guest” on a session you’re in. The host may need to approve them. In paid games you pay for your guests.' },
      { q: 'How do votes and ratings work?', a: 'After full time, vote once for Man of the Match of the whole session and rate your teammates from 1 to 10. Votes are anonymous: nobody, including the host, sees who voted for whom. Your rating for a game counts once enough teammates have rated you.' },
      { q: 'How do I add my goals?', a: 'After the game, open the session and tap “My goals”. The host approves them before they count in your stats.' },
      { q: 'What are medals and card styles?', a: 'Each medal (Goals, Assists, Appearances and more) levels up from Bronze to Legend. Your best level in each earns medal points, which unlock new player card styles: Silver, Gold, Platinum and Hall of Fame for Legend in every medal.' },
      { q: 'How do groups work?', a: 'A group is your regular squad: its games, tables, seasons and awards in one place. When someone invites you, you’ll find the invitation under Leagues: tap Join group or Decline. Open groups you can join straight away from Discover, and others let you ask to join.' },
      { q: 'How do I leave a group?', a: 'Open the group → Members → Leave group. Games you’ve already said yes to stay as they are, and your stats are kept. If you own the group, hand it to another member first (Group settings → Members → Transfer ownership).' },
      { q: 'How do I change my photo, flag or club?', a: 'Settings → Edit profile. Your nationality and the club you support are optional and show on your player card.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    items: [
      { q: 'Pay upfront or pay after: what’s the difference?', a: 'Upfront: your card is held when you pay and only charged once the host confirms the game took place. If they don’t confirm within 24 hours of the end, the hold is released. Upfront payment opens 6 days before kick-off. Pay after: you’re asked to pay once the host completes the session.' },
      { q: 'What is the booking fee?', a: 'A small fee added to each payment and shown before you pay. It covers card processing. The host receives their full price.' },
      { q: 'Can I get a refund?', a: 'If a game is cancelled, payments are refunded automatically, including the booking fee. Otherwise refunds are up to the host and are made through the app.' },
      { q: 'Why can’t I join the next game?', a: 'Some groups ask you to settle unpaid bills from earlier games first. Pay them from the session page, or ask the host to mark them as paid in cash.' },
      { q: 'What are late fines?', a: 'Some groups fine late arrivals. Fines are shown to you, added to your next payment in that group, and the host can waive them.' },
      { q: 'Is my card safe?', a: 'Card details are entered on Stripe’s secure pages and never reach MATCHDAY. Apple Pay and Google Pay work too.' },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting',
    items: [
      { q: 'How do I set up a game?', a: 'Tap + and fill in the details. Tap ☆ to save it as a preset, so next time it’s one tap from Create. The postcode is needed for directions, the kick-off forecast and nearby search. Invite friends or a group, or share the invite link.' },
      { q: 'How do I get paid?', a: 'Settings → Payouts to set up Stripe (you need to be 18 or over). Players’ money goes to your Stripe account and Stripe pays it to your bank. You’re responsible for your own tax.' },
      { q: 'How do I pick fair teams?', a: 'Open Squad → Balance teams. Teams are suggested from ratings and form, and the goalkeeper panel handles 0, 1 or 2 keepers. Drag players to adjust, then confirm and everyone is notified.' },
      { q: 'What do I do after the game?', a: 'Record the scores, approve players’ goals, then complete the session to open voting. Results are finalised when voting closes, or you can finalise early.' },
      { q: 'A player can’t come after the cut-off', a: 'Drop-outs close 24 hours before kick-off. After that, players tap “Can’t make it” and you get a notification. Open the game and tap “Let them drop out”: their place goes down the waiting list.' },
      { q: 'Someone dropped out on the day', a: 'The place is offered down the waiting list automatically. If nobody takes it you’ll get a notification. Share the invite link to fill it.' },
      { q: 'Can I remove someone from my group?', a: 'Owners and admins can, from the group’s Members tab. They’re also taken off the group’s upcoming games, and can only come back if an admin invites them back (Group settings → Removed players → Invite back).' },
      { q: 'Can I remove a player?', a: 'Yes, from the squad list. You can give a reason, and they can only come back if you invite them again.' },
      { q: 'What does the reliability warning mean?', a: 'Next to a player in your squad it means they turn up less than 90% of the time after saying they’re in.' },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      { q: 'Who can see my stats?', a: 'Choose in Settings → Privacy: everyone, friends or only you. Members of your groups always see your record within that group.' },
      { q: 'Something isn’t right / I want to report someone', a: 'Use Report on their profile or comment. Reports go straight to us and to the group’s admins.' },
      { q: 'How do I delete my account?', a: 'Settings → Delete account. It’s immediate and can’t be undone. Payments still in progress need to finish first.' },
    ],
  },
];
