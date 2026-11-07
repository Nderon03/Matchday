import type { CoachStep } from '@/features/Coachmarks';
import { tourTarget as t } from '@/features/tourTargets';

/**
 * A short tour for each screen: a friendly intro, then the spotlight on its key buttons.
 * Steps whose button isn't on screen right now are skipped. Each tour ends on the help
 * button, so people know where to find it again.
 */
const tour = (id: string, name: string, intro: Omit<CoachStep, 'target'>, steps: CoachStep[]) => ({
  name,
  steps: [intro, ...steps, { target: t(`help.${id}`), emoji: '💡', title: 'Help is always here', body: 'Tap this on any screen to replay its tips.' }] as CoachStep[],
});

export const SCREEN_TOURS = {
  matches: tour('matches', 'Matches', { emoji: '📅', title: 'Your matches', body: 'Every game you’re in or invited to, with your history underneath.' }, [
    { target: t('matches.find'), emoji: '🔎', title: 'Find a game', body: 'Public games near a postcode. Filter by day, size, distance and price.' },
    { target: t('matches.tabs'), emoji: '🗂️', title: 'Upcoming or history', body: 'Switch between games coming up and the ones you’ve played.' },
    { target: t('matches.first'), emoji: '👆', title: 'Tap a game', body: 'See who’s in, the teams, check in on the day and enter results afterwards.' },
  ]),
  leagues: tour('leagues', 'Leagues', { emoji: '🏆', title: 'Groups & tables', body: 'Your regular squads and how you rank against everyone.' }, [
    { target: t('leagues.discover'), emoji: '🧭', title: 'Discover groups', body: 'Find open groups near you to join.' },
    { target: t('leagues.tabs'), emoji: '📊', title: 'Groups or leaderboards', body: 'Your groups, or the tables: goals, wins, rating, MOTMs and more.' },
  ]),
  create: tour('create', 'Create', { emoji: '➕', title: 'Make something', body: 'Start a game, a group, or invite friends.' }, [
    { target: t('create.presets'), emoji: '⭐', title: 'Your presets', body: 'Games you starred. One tap starts a new one with the same settings.' },
    { target: t('create.session'), emoji: '⚽', title: 'New session', body: 'Pick a day, format and price. Takes about 30 seconds.' },
    { target: t('create.group'), emoji: '👥', title: 'New group', body: 'For your regular squad: its own tables, seasons and awards.' },
    { target: t('create.friends'), emoji: '🤝', title: 'Invite friends', body: 'Add mates by username or QR so you can invite them to games.' },
  ]),
  profile: tour('profile', 'your profile', { emoji: '🪪', title: 'Your profile', body: 'Your player card, stats, form and medals. Here’s everything on this page.' }, [
    { target: t('profile.payments'), emoji: '💳', title: 'Payments', body: 'Everything you’ve paid and anything you owe.' },
    { target: t('profile.settings'), emoji: '⚙️', title: 'Settings', body: 'Notifications, payouts, privacy, theme and your account.' },
    { target: t('profile.card'), emoji: '✨', title: 'Your player card', body: 'Earn medals to unlock new styles and titles. It’s what people see when you share your link.' },
    { target: t('profile.edit'), emoji: '🎨', title: 'Make it yours', body: 'Change your photo, flag, club, card style, title and medals.' },
    { target: t('profile.share'), emoji: '📤', title: 'Show it off', body: 'Share your card as a picture.' },
    { target: t('profile.wrapped'), emoji: '🎁', title: 'Wrapped', body: 'Your season in one shareable story.' },
    { target: t('profile.stats'), emoji: '📊', title: 'Career or one group', body: 'Swipe to see your stats everywhere, or just in one group.' },
    { target: t('profile.form'), emoji: '📈', title: 'Your form', body: 'Your last few ratings and how they’re trending.' },
    { target: t('profile.medals'), emoji: '🏅', title: 'Medals', body: 'Each one levels up from Bronze to Legend. Tap See all for the details.' },
  ]),
  session: tour('session', 'this game', { emoji: '⚽', title: 'The game page', body: 'Everything about this game. Here’s what’s where.' }, [
    { target: t('session.preset'), emoji: '⭐', title: 'Save as a preset', body: 'Hosting this every week? Star it to reuse the settings in one tap.' },
    { target: t('session.invite'), emoji: '➕', title: 'Invite players', body: 'Invite friends or group members, or share the invite link.' },
    { target: t('session.info'), emoji: '📍', title: 'When, where and the price', body: 'Add it to your calendar, get directions, and see the kick-off forecast.' },
    { target: t('session.rsvp'), emoji: '✋', title: 'Are you in?', body: 'Say you’re in or can’t make it. Drop-outs close 24 hours before kick-off; after that, tap to tell the host.' },
    { target: t('session.host'), emoji: '🧢', title: 'Host controls', body: 'One button for the next step (teams, scores, approvals), and “More host tools” for the rest.' },
    { target: t('session.needplayers'), emoji: '📣', title: 'Need players?', body: 'Short on numbers? One tap asks friends of your squad and players who play nearby.' },
    { target: t('session.squad'), emoji: '👥', title: 'The squad', body: 'Who’s playing. Tap “See squad” for everyone and their guests.' },
  ]),
  'session-new': tour('session-new', 'new sessions', { emoji: '🗓️', title: 'New session', body: 'Only the essentials, top to bottom. Swipe or tap the arrows to change each choice.' }, [
    { target: t('form.name'), emoji: '✏️', title: 'Name it', body: 'Something your squad will recognise, like “Wednesday Football”.' },
    { target: t('form.group'), emoji: '👥', title: 'Group', body: 'Pick one of your groups so it counts in their tables, or leave it as a one-off.' },
    { target: t('form.when'), emoji: '⏰', title: 'Kick-off', body: 'Tap the date for a calendar; type the time and the colon goes in for you.' },
    { target: t('form.format'), emoji: '🔁', title: 'Format & length', body: '5-a-side means up to 10 players. Anyone else joins the waiting list.' },
    { target: t('form.venue'), emoji: '📍', title: 'Venue & postcode', body: 'The postcode gives players directions, the forecast and lets people nearby find it.' },
    { target: t('form.payment'), emoji: '💷', title: 'Payment', body: 'Free, pay upfront (card held, charged after) or pay after the game.' },
    { target: t('form.join'), emoji: '🔐', title: 'Who can join', body: 'Invite only, your group, or public so anyone nearby can find it.' },
    { target: t('form.invite'), emoji: '📨', title: 'Invite players', body: 'Tick friends and group members, or Select all.' },
    { target: t('form.notes'), emoji: '📝', title: 'Notes', body: 'Anything else: bring bibs, astro boots only…' },
    { target: t('form.star'), emoji: '⭐', title: 'Save as a preset', body: 'Tap the star to reuse these settings next week.' },
  ]),
  friends: tour('friends', 'Friends', { emoji: '🤝', title: 'Friends', body: 'Play together, compare stats and invite each other to games.' }, [
    { target: t('friends.add'), emoji: '📲', title: 'Scan or show your QR', body: 'The quickest way to add someone standing next to you.' },
    { target: t('friends.tabs'), emoji: '📬', title: 'Friends, requests and find', body: 'See your friends, accept requests (a handshake celebrates each one), or search by username.' },
  ]),
  achievements: tour('achievements', 'medals', { emoji: '🏅', title: 'Medals', body: 'Each medal levels up from Bronze to Legend as you play.' }, [
    { target: t('ach.streak'), emoji: '🔥', title: 'Your streak', body: 'Weeks in a row with a game. Keep turning up to keep it going.' },
    { target: t('ach.grid'), emoji: '📈', title: 'Your progress', body: 'Tap a medal to see every level and how close you are.' },
    { target: t('ach.card'), emoji: '🃏', title: 'Unlock card styles', body: 'Medal points unlock Bronze to Hall of Fame cards. Pick yours here.' },
  ]),
  'edit-profile': tour('edit-profile', 'editing your profile', { emoji: '🎨', title: 'Make your card yours', body: 'Everything you change shows on your card straight away. Nothing is saved until you press Save.' }, [
    { target: t('ep.card'), emoji: '🪪', title: 'Live preview', body: 'This is your card as others see it. Tap a locked style or title to preview it.' },
    { target: t('ep.photo'), emoji: '📷', title: 'Your photo', body: 'Pick a photo, or remove it to show your initials.' },
    { target: t('ep.title'), emoji: '🏷️', title: 'Titles', body: 'A line under your name. Some are free; the rest unlock as you play.' },
    { target: t('ep.styles'), emoji: '🌈', title: 'Card styles', body: 'Free colours, plus Bronze to Hall of Fame as you earn medal points.' },
    { target: t('ep.medals'), emoji: '🎖️', title: 'Show off medals', body: 'Pick up to three, at the level you like.' },
    { target: t('ep.name'), emoji: '🙋', title: 'Your name', body: 'How you appear to everyone.' },
    { target: t('ep.username'), emoji: '@', title: 'Username', body: 'Friends find you by this. We check it’s free as you type.' },
    { target: t('ep.bio'), emoji: '💬', title: 'Bio', body: 'A line about you, like “Left foot only”.' },
    { target: t('ep.position'), emoji: '🧤', title: 'Position', body: 'Used when balancing teams, and shown on your card.' },
    { target: t('ep.identity'), emoji: '🏳️', title: 'Flag and club', body: 'Optional: your nationality and the club you support, on your card.' },
    { target: t('ep.save'), emoji: '💾', title: 'Save', body: 'Saves everything at once. Leave without saving and we’ll check first.' },
  ]),
  compare: tour('compare', 'Compare', { emoji: '⚔️', title: 'Head to head', body: 'Put any two players side by side.' }, [
    { target: t('compare.source'), emoji: '🔀', title: 'Career or a group', body: 'Swipe to compare across everything, or within one group.' },
    { target: t('compare.vs'), emoji: '👆', title: 'Pick players', body: 'Tap a side to search, or swipe it to flick through people.' },
  ]),
  find: tour('find', 'Find a game', { emoji: '🔎', title: 'Find a game', body: 'Public games you can join, nearest first.' }, [
    { target: t('find.where'), emoji: '📍', title: 'Where', body: 'A postcode or area, and optionally a venue or game name.' },
    { target: t('find.filters'), emoji: '🎚️', title: 'Filters', body: 'Swipe to choose when, size, how far and price.' },
  ]),
  lineup: tour('lineup', 'line-ups', { emoji: '👕', title: 'Line-ups', body: 'Pick fair teams for each game.' }, [
    { target: t('lineup.balance'), emoji: '⚖️', title: 'Balance teams', body: 'We suggest teams from ratings and form. Tap a player to move them or make them keeper.' },
  ]),
  vote: tour('vote', 'voting', { emoji: '⭐', title: 'Vote', body: 'Pick one Man of the Match for the whole session and rate the players. It’s anonymous.' }, []),
  results: tour('results', 'scores', { emoji: '🥅', title: 'Scores', body: 'Enter the score for each game, then complete the session to open voting.' }, []),
  goals: tour('goals', 'goals', { emoji: '⚽', title: 'Goals', body: 'Players claim their goals and assists; the host approves them before they count.' }, []),
  attendance: tour('attendance', 'attendance', { emoji: '✅', title: 'Attendance', body: 'Swipe each player to Played, Arrived late or Absent. Only verified players get stats.' }, []),
  'session-payments': tour('session-payments', 'payments', { emoji: '💷', title: 'Payments', body: 'Who’s paid, who owes, and payouts. Mark cash payments here.' }, []),
  'group-settings': tour('group-settings', 'group settings', { emoji: '⚙️', title: 'Group settings', body: 'Everything about the group, top to bottom. Remember to save.' }, [
    { target: t('gs.identity'), emoji: '🛡️', title: 'Logo and name', body: 'Tap the logo to change it; the cover photo link is under the name.' },
    { target: t('gs.about'), emoji: '📝', title: 'About', body: 'Who you are, where you play and any house rules.' },
    { target: t('gs.access'), emoji: '🔐', title: 'Who can join', body: 'Invite only, ask to join, or open to anyone.' },
    { target: t('gs.rules'), emoji: '📏', title: 'Game rules', body: 'Assists, tables, voting, settle-up and late fines, one line each.' },
    { target: t('gs.save'), emoji: '💾', title: 'Save changes', body: 'Saves everything above.' },
    { target: t('gs.members'), emoji: '👥', title: 'Members', body: 'Tap someone to change their role, hand over ownership or remove them.' },
    { target: t('gs.delete'), emoji: '🗑️', title: 'Delete group', body: 'Owners only, and we always ask first. Players keep their career stats.' },
  ]),
  discover: tour('discover', 'Discover', { emoji: '🧭', title: 'Discover groups', body: 'Open groups you can join straight away, and others you can ask to join.' }, []),
  player: tour('player', 'player pages', { emoji: '👤', title: 'Player page', body: 'Their card, stats, form and medals. Add them as a friend or compare yourself with them.' }, []),
  notifications: tour('notifications', 'notifications', { emoji: '🔔', title: 'Notifications', body: 'Tap one to jump to it. Choose what you hear about in Settings → Notifications.' }, []),
  settings: tour('settings', 'Settings', { emoji: '🛠️', title: 'Settings', body: 'Everything about your account, top to bottom.' }, [
    { target: t('settings.profile'), emoji: '🎨', title: 'Edit profile', body: 'Your photo, name, card style, title and medals.' },
    { target: t('settings.notifications'), emoji: '🔔', title: 'Notifications', body: 'Turn each kind on or off: invites, line-ups, votes, payments and more.' },
    { target: t('settings.payouts'), emoji: '💷', title: 'Payouts', body: 'Hosting paid games? Connect Stripe and players’ money goes straight to your bank.' },
    { target: t('settings.history'), emoji: '🧾', title: 'Payment history', body: 'Every payment and refund.' },
    { target: t('settings.calendar'), emoji: '📆', title: 'Calendar sync', body: 'Every game in Google or Apple Calendar, updated when games change.' },
    { target: t('settings.blocked'), emoji: '🚫', title: 'Blocked players', body: 'People you’ve blocked. Unblock them here.' },
    { target: t('settings.privacy'), emoji: '🔒', title: 'Who sees your stats', body: 'Everyone, just friends, or only you. Group mates always see your record in that group.' },
    { target: t('settings.theme'), emoji: '🌗', title: 'Dark or light', body: 'Pick a look, or follow your phone’s setting.' },
    { target: t('settings.tour'), emoji: '▶️', title: 'Replay the app tour', body: 'The 30-second look around, any time.' },
    { target: t('settings.tips'), emoji: '✨', title: 'These tips', body: 'Switch off the automatic tips. The help button on each screen always works.' },
    { target: t('settings.resettips'), emoji: '🔄', title: 'Show all tips again', body: 'Every screen plays its tips again next time you open it.' },
    { target: t('settings.faq'), emoji: '📖', title: 'Help & FAQ', body: 'Payments, waiting lists, fines, medals and hosting.' },
    { target: t('settings.contact'), emoji: '✉️', title: 'Contact us', body: 'Found a bug or got an idea? Email us. We read everything.' },
    { target: t('settings.signout'), emoji: '👋', title: 'Sign out', body: 'Sign out on this device.' },
    { target: t('settings.delete'), emoji: '🗑️', title: 'Delete account', body: 'Permanently removes your account. We ask you to confirm first.' },
  ]),
  payments: tour('payments', 'your payments', { emoji: '🧾', title: 'Your payments', body: 'Every payment and refund, and anything still to pay.' }, []),
  wrapped: tour('wrapped', 'Wrapped', { emoji: '🎁', title: 'Wrapped', body: 'Your season in one story. Swipe the period and share it.' }, []),
  'group-new': tour('group-new', 'new groups', { emoji: '👥', title: 'New group', body: 'Give it a name and choose who can join. You can change everything later.' }, []),
};

export type TourId = keyof typeof SCREEN_TOURS;
