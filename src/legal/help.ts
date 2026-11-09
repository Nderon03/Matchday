/** In-app Help & FAQ (also public at /help). Keep answers in step with how the app behaves. */
export interface HelpItem { q: string; a: string }
export interface HelpSection { id: string; title: string; items: HelpItem[] }

export const HELP: HelpSection[] = [
  {
    id: 'playing',
    title: 'Playing',
    items: [
      { q: 'What can I use MATCHDAY for?', a: 'Any regular football game: 5-a-side, 7-a-side, 11-a-side or a casual kickabout. MATCHDAY is an independent app made by Ned’s Games. It isn’t affiliated with The FA or its “Matchday by England Football” app for registered clubs.' },
      { q: 'Can I see the app tour again?', a: 'Yes: tap ? at the top of Home → Replay the app tour, or Settings → Replay the app tour. Each group page has its own ? for a quick tour of that page too.' },
      { q: 'How do I join a game?', a: 'Open the invite link or scan the QR code the host shares, or use Find a game to search public games near a postcode. Then tap “I’m in”.' },
      { q: 'What happens if the game is full?', a: 'You go on the waiting list. More than 24 hours before kick-off you move up automatically when a place opens. On the day, the next player is offered the place and has 30 minutes to tap “I’m in” before it goes to the next person.' },
      { q: 'I can’t make it any more', a: 'Open the game and tap “Can’t make it”, so the next player gets your place. You can do this until 24 hours before kick-off. After that, tap “Can’t make it” to tell the host: they take you off, but it counts against your reliability.' },
      { q: 'What is reliability?', a: 'How often you turn up after saying you’re in. No-shows and dropping out in the last 24 hours count against it. It shows once you’ve played 5 games, and players on 100% over 10 or more games get a special badge on their card.' },
      { q: 'Can I bring a friend?', a: 'Yes: tap “Add a guest” on a game you’re in. The host may need to approve them. In paid games you pay for your guests.' },
      { q: 'How do votes and ratings work?', a: 'After full time, vote once for Man of the Match and rate your teammates from 1 to 10. It’s once however many games you played: when there were several, the award is called Player of the Night (Player of the Day before 5pm), and it counts as a Man of the Match in your stats. Votes are anonymous: nobody, including the host, sees who voted for whom. Your rating for a game counts once enough teammates have rated you.' },
      { q: 'What are the Dream Team, Golden Boot and Record Book?', a: 'Each group’s Matchday Dream Team is its best five of the month by rating, with the Player of the Month as captain. The Golden Boot goes to the season’s top scorer. The Record Book (on the group’s History tab) keeps the biggest wins, most goals in a game and other records.' },
      { q: 'How do I add my goals?', a: 'After the game, open the game and tap “My goals”. If you played more than one game, add them game by game. The host approves them before they count in your stats.' },
      { q: 'Why can’t I claim more goals?', a: 'A team’s players can’t have more goals, or more assists, than the team scored. If your team scored 4 and teammates already have 3 approved, you can claim 1. Hosts can mark own goals and goals nobody claimed, and correct anyone’s goals or assists if something’s wrong.' },
      { q: 'What are medals and card styles?', a: 'Each medal (Goals, Assists, Appearances and more) levels up from Bronze to Legend. Your best level in each earns medal points, which unlock new player card styles: Silver, Gold, Platinum and Hall of Fame for Legend in every medal.' },
      { q: 'How do groups work?', a: 'A group is your regular squad: its games, tables, seasons and awards in one place. When someone invites you, you’ll find the invitation under Leagues: tap Join group or Decline. Open groups you can join straight away from Discover, and others let you ask to join.' },
      { q: 'How do I leave a group?', a: 'Open the group → Members → Leave group. Games you’ve already said yes to stay as they are, and your stats are kept. If you own the group, hand it to another member first (Group settings → Members → tap them → Transfer ownership).' },
      { q: 'How do I change my photo, flag or club?', a: 'Settings → Edit profile. Your nationality and the club you support are optional and show on your player card.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    items: [
      { q: 'Pay upfront or pay after: what’s the difference?', a: 'Upfront: your card is held when you pay and only charged once the host confirms the game took place. If they don’t confirm within 24 hours of the end, the hold is released. Upfront payment opens 6 days before kick-off. Pay after: you’re asked to pay once the host completes the game.' },
      { q: 'What is the booking fee?', a: 'A small fee added to each payment and shown before you pay. It covers card processing. The host receives their full price.' },
      { q: 'Can I get a refund?', a: 'If a game is cancelled, payments are refunded automatically, including the booking fee. Otherwise refunds are up to the host and are made through the app.' },
      { q: 'Why can’t I join the next game?', a: 'Some groups ask you to settle unpaid bills from earlier games first. Pay them from the game page, or ask the host to mark them as paid in cash.' },
      { q: 'What are late fines?', a: 'Some groups that charge for games fine late arrivals. If the host marks you as late, you’re fined (usually £1), and it doubles each time you’re late again (£2, £4, £8), up to the group’s maximum. Three on-time games in a row take you back to the start. Free games never count.' },
      { q: 'How do I pay a fine?', a: 'It’s added to your next payment in that group, so you pay it with your next game. You can see your fines on the group page. If the group has “Settle up before playing” on, an unpaid bill (fines included) stops you joining the next game until it’s paid. Hosts can waive a fine or mark it paid in cash.' },
      { q: 'Is my card safe?', a: 'Card details are entered on Stripe’s secure pages and never reach MATCHDAY. Apple Pay and Google Pay work too.' },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting',
    items: [
      { q: 'How do I set up a game?', a: 'Tap + and fill in the details. Tap ☆ to save it as a preset, so next time it’s one tap from Create. The postcode is needed for directions, the kick-off forecast and nearby search. Invite friends or a group, or share the invite link.' },
      { q: 'How do I get paid?', a: 'Settings → Payouts to set up Stripe (you need to be 18 or over). Players’ money goes to your Stripe account and Stripe pays it to your bank. You’re responsible for your own tax.' },
      { q: 'We play several games in a night. How does that work?', a: 'Save each game’s score in Scores. You’ll be asked what’s next: new fair teams (balanced on ratings and mixed up from the last game), the same teams, picking them yourself, or full time. Teams for later games don’t send notifications, since everyone’s at the pitch. The game page shows tonight’s table, and players enter their goals game by game.' },
      { q: 'How do I pick fair teams?', a: 'Open Squad → Balance teams. Teams are suggested from ratings and form, and the goalkeeper panel handles 0, 1 or 2 keepers. Drag players to adjust, then confirm and everyone is notified.' },
      { q: 'What do I do after the game?', a: 'Record the scores, approve players’ goals, then complete the game to open voting. Results are finalised when voting closes, or you can finalise early.' },
      { q: 'A player can’t come after the cut-off', a: 'Drop-outs close 24 hours before kick-off. After that, players tap “Can’t make it” and you get a notification. Open the game and tap “Let them drop out”: their place goes down the waiting list.' },
      { q: 'Someone dropped out on the day', a: 'The place is offered down the waiting list automatically. If nobody takes it you’ll get a notification. Share the invite link to fill it.' },
      { q: 'How do I turn on late fines?', a: 'Group settings → Late fines. Choose the first fine and the maximum, and how many on-time games reset it. After a game, mark who was late in Attendance. Each fine has a ⋯ menu to waive it, change it or mark it paid in cash.' },
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
