// Visual layout check for signed-in screens. Network calls are answered from canned
// fixtures (this verifies layout/rendering only — backend behaviour is covered by the
// database test-suite in tests/db). Requires a web export built with
// EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIST = join(process.cwd(), 'dist');
const OUT = process.env.SCREENSHOT_DIR ?? join(process.cwd(), 'e2e-screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const f = await readFile(join(DIST, path)); res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }); res.end(f); }
  catch { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await readFile(join(DIST, 'index.html'))); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const ME = '11111111-1111-4111-8111-111111111111';
const LEGAL_VERSION = (await readFile(join(process.cwd(), 'src/legal/content.ts'), 'utf8')).match(/LEGAL_VERSION = '([^']+)'/)[1];
const names = ['Sam Carter', 'Alex Reid', 'Jordan Pike', 'Chris Obi', 'Danny Shaw', 'Leo Marsh', 'Ravi Patel', 'Tom Wells', 'Nico Ferri', 'Ben Hale'];
const people = names.map((n, i) => ({ id: i === 0 ? ME : `2222222${i}-2222-4222-8222-22222222222${i}`, username: n.split(' ')[0].toLowerCase(), display_name: n, avatar_url: null, position: ['GK', 'DEF', 'MID', 'FWD', 'ANY'][i % 5] }));
const SID = '33333333-3333-4333-8333-333333333333';
const FID = '44444444-4444-4444-8444-444444444444';
const GID = '55555555-5555-4555-8555-555555555555';
// Store shots use a game later today, so Home is in Matchday mode with the countdown
const kickoff = process.env.STORE_SHOTS === '1'
  ? (() => { const d = new Date(Date.now() + 2 * 3600_000 + 14 * 60_000); return (d.getDate() === new Date().getDate() ? d : new Date(Date.now() + 5 * 60_000)).toISOString(); })()
  : (() => { const d = new Date(Date.now() + 86400_000); d.setHours(19, 0, 0, 0); return d.toISOString(); })();
const session = { id: SID, group_id: GID, host_id: ME, name: 'Wednesday Football', starts_at: kickoff, duration_minutes: 60, venue: 'Riverside Sports Centre, Pitch 2', location: 'London', postcode: 'NW7 2EU', latitude: 51.6142, longitude: -0.2447, format_size: 5, max_attendance: 10, visibility: 'group', description: 'Bring both bibs.', payment_mode: 'upfront', price_pence: 600, currency: 'gbp', mode: 'single', motm_mode: 'session', status: 'scheduled', rsvp_deadline: null, voting_closes_at: null, template_id: null, host_confirmed_at: null };
const team = (side, ids) => ({ id: `t${side}`, fixture_id: FID, side, name: side === 'A' ? 'Bibs' : 'Non-bibs', colour: side === 'A' ? '#22C55E' : '#F5F5F5', score: null,
  players: ids.map((uid, i) => ({ fixture_team_id: `t${side}`, fixture_id: FID, user_id: uid, position: ['GK', 'DEF', 'DEF', 'MID', 'FWD'][i] ?? 'ANY', is_goalkeeper: i === 0, is_substitute: false, sort_order: i })) });
const fixtures = [{ id: FID, session_id: SID, number: 1, played: false, lineup_confirmed_at: kickoff, teams: [team('A', people.slice(0, 5).map((p) => p.id)), team('B', people.slice(5, 9).map((p) => p.id))] }];
fixtures[0].teams[1].players.push({ fixture_team_id: 'tB', fixture_id: FID, user_id: null, guest_id: 'g1111111-1111-4111-8111-111111111111', position: 'ANY', is_goalkeeper: false, is_substitute: false, sort_order: 9 });
const attendance = people.map((p, i) => ({ session_id: SID, user_id: p.id, status: 'confirmed', waitlisted_at: null, checked_in_at: i < 3 ? kickoff : null, verification: 'unverified', late_arrival: false, replacement_for: null, profile: p }));
const lb = [
  ...people.slice(0, 6).map((p, i) => ({ rank: i + 1, user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, value: 24 - i * 3, appearances: 12 - i, is_me: p.id === ME, total: 6, qualified: true, progress: 12 - i, needed: 0 })),
  ...people.slice(6, 8).map((p, i) => ({ rank: null, user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, value: 3 - i, appearances: 2 - i, is_me: false, total: 6, qualified: false, progress: 2 - i, needed: 5 })),
];
const home = {
  profile: { ...people[0], onboarded: true }, unread_notifications: 3,
  next_session: { ...session, my_status: 'confirmed', confirmed: 9, lineup_ready: true, is_host: true },
  tasks: [{ kind: 'vote', session_id: SID, title: 'Tuesday 6-a-side', subtitle: 'Vote for MOTM and rate players', due_at: new Date(Date.now() + 5 * 3600_000).toISOString(), count: 1 },
          { kind: 'payment', session_id: SID, title: 'Sunday League Prep', subtitle: '£5 due', due_at: null, count: 1 }],
  recent_results: [{ session_id: SID, name: 'Tuesday 6-a-side', played_at: new Date(Date.now() - 86400_000).toISOString(), wins: 2, draws: 1, losses: 1, goals: 3, rating_avg: 7.8, rating_eligible: true, motm: true }],
  career: { sessions: 42, goals: 61, motm: 9, rating: 7.24 },
  achievements: [{ code: 'haul_l3', name: 'Big Game', icon: 'flash' }, { code: 'goals_l4', name: 'Goals', icon: 'football' }],
  groups: [{ id: GID, name: 'Wednesday Football', logo_url: null, my_rank: 2, leader: { display_name: 'Alex Reid', value: 7.6 } }],
};
const table = {
  groups: [{ id: GID, name: 'Wednesday Football', description: 'Weekly 5-a-side in Hackney.', visibility: 'private', join_policy: 'request', location: 'Hackney', rules: null, logo_url: null, cover_url: null, created_by: ME }],
  profiles: [{ ...people[0], onboarded: true, bio: 'Left foot only.', created_at: '2026-01-01T00:00:00Z', terms_version: LEGAL_VERSION, terms_accepted_at: '2026-11-01T00:00:00Z', card_style: 'gold', nationality: 'XK', supported_club: 'arsenal', card_medals: ['goals_l3', 'motm_l2', 'season_champion'], card_title: 'baller' }],
  session_videos: [{ id: 'v1', session_id: SID, video_id: 'dQw4w9WgXcQ', title: 'Game 1', added_by: ME, created_at: kickoff }],
  payments: [],
  session_guests: [{ id: 'g1111111-1111-4111-8111-111111111111', session_id: SID, name: 'Dave', added_by: people[1].id, status: 'confirmed', created_at: kickoff },
                   { id: 'g2222222-2222-4222-8222-222222222222', session_id: SID, name: 'Marco', added_by: people[2].id, status: 'pending', created_at: kickoff }],
  sessions: [session], session_attendance: attendance, session_invitations: [], fixtures, session_hosts: [], goal_submissions: [], player_goals: [],
  motm_awards: [], session_player_statistics: [],
  notifications: [{ id: 'n1', type: 'session_removed', title: 'Removed from Sunday Kickabout', body: '', data: { session_id: SID, session_name: 'Sunday Kickabout', reason: 'Too many no-shows' }, read_at: null, created_at: kickoff }], activity_feed: [],
  group_members: [{ role: 'owner', user_id: ME, joined_at: '2026-01-01T00:00:00Z', profile: people[0], group: { id: GID, name: 'Wednesday Football', logo_url: null, location: 'Hackney', group_members: [{ count: 14 }] } }],
  group_settings: [{ group_id: GID, track_assists: true, leaderboard_min_appearances: 3, voting_window_hours: 24, rating_min_votes: null, default_motm_mode: 'session',
    late_fines_enabled: false, late_fine_base_pence: 100, late_fine_cap_pence: 800, late_fine_reset_after: 3, require_settled: true }],
  achievements: [], friendships: [], friend_requests: [], user_blocks: [], session_templates: [], user_preferences: [{ user_id: ME, profile_visibility: 'public', show_stats: true, push_enabled: true, email_enabled: true, notification_prefs: {}, theme: 'dark' }],
};
const ago = (days) => new Date(Date.now() - days * 86400_000).toISOString();
// tracks: [track, name, icon, targets, value, levels unlocked, days ago of the newest level]
const TRACKS = [
  ['apps', 'Appearances', 'shirt', [1, 10, 25, 50, 100], 42, 3, 60],
  ['goals', 'Goals', 'football', [1, 10, 25, 50, 100], 61, 4, 20],
  ['assists', 'Assists', 'git-merge', [1, 10, 25, 50, 100], 18, 2, 40],
  ['motm', 'Man of the Match', 'star', [1, 5, 10, 25, 50], 9, 2, 30],
  ['weeks', 'Ever-present', 'flame', [3, 5, 10, 20, 40], 9, 2, 25],
  ['wins', 'Win Streak', 'trending-up', [3, 5, 7, 10, 15], 4, 1, 90],
  ['unbeaten', 'Unbeaten Run', 'shield-checkmark', [5, 10, 15, 20, 30], 3, 0, 0],
  ['haul', 'Big Game', 'flash', [2, 3, 4, 5, 6], 4, 3, 1],
];
const LV = ['bronze', 'silver', 'gold', 'platinum', 'legend'];
const myAchievements = {
  players: 140,
  points: 17,
  card_style: 'gold',
  streak: { current: 6, best: 9 },
  items: [
    ...TRACKS.flatMap(([track, name, icon, targets, value, levels, days]) => targets.map((target, i) => ({
      code: `${track}_l${i + 1}`, name, description: `Reach ${target}.`, icon, tier: LV[i], track, level: i + 1, target, value,
      unlocked_at: i < levels ? ago(i === levels - 1 ? days : days + 60) : null, holders: Math.max(0, 120 - i * 30),
    }))),
    { code: 'season_champion', name: 'Season Champion', description: 'Be named Player of the Season.', icon: 'ribbon', tier: 'legend', track: 'season_champion', level: null, target: 1, value: 1, unlocked_at: ago(2), holders: 3 },
  ],
};
const reveal = {
  session_id: SID, name: 'Wednesday Football', played_at: ago(1), finalised_at: ago(0.5), group_name: 'Wednesday Football',
  fixtures_played: 4, wins: 3, draws: 0, losses: 1, goals: 3, assists: 1, rating_avg: '8.40', rating_eligible: true,
  motm: true, motm_shared: false, prev_max_goals: 2, prev_max_assists: 2, prev_best_rating: '8.10', prev_rated: 12,
};
const rpcs = {
  create_invite_link: 'Ab12Cd34',
  get_match_reveals: [],
  get_calendar_feed: 'a'.repeat(64),
  get_my_group_invites: [{ group_id: '66666666-6666-4666-8666-666666666666', name: 'Sunday Kickabout', logo_url: null, location: 'Mill Hill', members: 12, invited_by: 'Alex Reid', created_at: ago(0.2) }],
  get_reliability: Object.fromEntries(people.map((p, i) => [p.id, i === 0 ? { attended: 20, no_shows: 0, late_drops: 0, pct: 100 } : { attended: 20, no_shows: i === 3 ? 4 : 0, late_drops: i === 3 ? 2 : 1, pct: i === 3 ? 77 : 95 }])),
  get_month_candidates: {
    sessions: 4,
    players: people.slice(0, 8).map((p, i) => ({ user_id: p.id, display_name: p.display_name, username: p.username, avatar_url: null, position: p.position,
      rated: 3, rating: (8.4 - i * 0.25).toFixed(2), goals: 6 - i, assists: i % 3, motm: i === 0 ? 2 : 0, apps: 4 })),
  },
  get_player_connections: {
    partner: { player: people[1], games: 18, wins: 13, win_pct: 72 },
    nemesis: { player: people[3], games: 8, wins: 2, losses: 6 },
  },
  get_personal_bests: {
    best_rating: { value: '8.60', session_id: SID, name: 'Tuesday 6-a-side', played_at: ago(40) },
    most_goals: { value: 4, session_id: SID, name: 'Wednesday Football', played_at: ago(12) },
    most_assists: null, best_win_streak: 6, best_unbeaten: 9, best_weeks: 9,
  },
  get_my_achievements: myAchievements,
  set_card_image: '2026-11-06T12:00:00Z',
  set_card_style: 'crimson',
  set_card_medals: [],
  set_card_title: 'baller',
  get_home_dashboard: home, get_pending_tasks: home.tasks, is_session_manager: true,
  get_session_payment_statuses: people.slice(1, 9).map((p, i) => ({ user_id: p.id, status: ['paid', 'authorised', 'unpaid', 'paid', 'failed', 'paid', 'pending', 'paid'][i], method: 'card' })),
  get_player_strengths: people.slice(0, 9).map((p, i) => ({ user_id: p.id, position: p.position, group_rating: 6 + (i % 4) * 0.5, career_rating: 6.5, form: 7, games: 10, gk_games: i === 0 ? 5 : 0 })),
  get_recent_pairings: [], get_leaderboard: lb,
  search_public_sessions: [
    { id: SID, name: 'Thursday Night 5s', starts_at: kickoff, duration_minutes: 60, venue: 'Riverside Sports Centre, Pitch 2', location: 'Hackney', format_size: 5, max_attendance: 10, confirmed: 7, price_pence: 500, payment_mode: 'after', host_id: ME, host_name: 'Sam Carter', host_avatar: null, my_status: null, postcode: 'E8 1EJ', distance_miles: 1.4 },
    { id: SID, name: 'Sunday Sevens', starts_at: kickoff, duration_minutes: 90, venue: 'Parkside Pitches', location: 'Camden', format_size: 7, max_attendance: 14, confirmed: 14, price_pence: 0, payment_mode: 'free', host_id: ME, host_name: 'Alex Reid', host_avatar: null, my_status: null, postcode: 'NW1 7AA', distance_miles: 3.8 },
  ],
  get_payment_summary: { price_pence: 600, payment_mode: 'upfront', host_confirmed_at: null, collected_pence: 1800, authorised_pence: 1200, outstanding_pence: 1800, paid_count: 3, unpaid_count: 2, failed_count: 1, refunded_count: 0,
    players: people.slice(1, 7).map((p, i) => ({ user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, status: ['paid', 'authorised', 'unpaid', 'paid', 'failed', 'paid'][i], amount_pence: i === 1 ? 1200 : 600, method: i === 3 ? 'cash' : 'card', paid_at: null, payment_id: `p${i}`, guest_count: i === 1 ? 1 : 0, fines_pence: i === 2 ? 100 : 0, refunded: 0, guest_payment_id: i === 0 ? 'gp0' : null, guest_status: i === 0 ? 'unpaid' : null, guest_amount_pence: i === 0 ? 600 : null, guest_bill_count: i === 0 ? 1 : null })) },
  get_player_profile: { profile: table.profiles[0], can_view_stats: true, is_self: true, is_friend: false, friend_request: null, friends_count: 18,
    stats: { sessions: 42, fixtures: 96, wins: 51, draws: 12, losses: 33, goals: 61, assists: 22, motm: 9, rating: 7.2, rated_sessions: 38, highest_rating: 9.1, win_pct: 53.1, current_win_streak: 2, best_win_streak: 7, current_unbeaten: 4, best_unbeaten: 11 },
    form: [7.1, 6.8, 8.2, 7.4, 7.9].map((r, i) => ({ session_id: `s${i}`, rating: r, played_at: new Date(Date.now() - (5 - i) * 7 * 86400_000).toISOString() })),
    rating_history: [6.2, 6.8, 7.0, 6.5, 7.4, 7.1, 6.8, 8.2, 7.4, 7.9].map((r, i) => ({ session_id: `h${i}`, rating: r, played_at: new Date(Date.now() - (10 - i) * 7 * 86400_000).toISOString() })),
    recent_results: home.recent_results, achievements: ['apps_l1', 'apps_l2', 'apps_l3', 'goals_l1', 'goals_l2', 'goals_l3', 'goals_l4', 'haul_l1', 'haul_l2', 'haul_l3', 'motm_l1', 'motm_l2', 'weeks_l1', 'weeks_l2', 'assists_l1', 'assists_l2', 'wins_l1', 'season_champion'].map((code) => ({ code, name: code, icon: 'star', description: '', unlocked_at: '2026-03-01T00:00:00Z' })),
    groups: [{ id: GID, name: 'Wednesday Football', logo_url: null, role: 'owner' }], teammates: people.slice(1, 4).map((p, i) => ({ user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, games: 30 - i * 6, wins: 16 - i * 3 })) },
};

const browser = await chromium.launch();
const failures = [];
const cardUploads = [];
const calls = [];
async function openPage(vp, { dpr = 1, theme = 'dark', appTour = false, tips = false } = {}) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([uid, th, tour, tipsOn]) => {
    localStorage.setItem('matchday.theme', th);
    if (!tipsOn) localStorage.setItem('matchday.tips', 'off');
    if (!tour) localStorage.setItem(`matchday.appTour.${uid}`, '1');
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp, aud: 'authenticated', email: 'sam@example.com' })}.sig`;
    localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: uid, email: 'sam@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
  }, [ME, theme, appTour, tips]);
  await page.route(/example\.supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    let body = [];
    if (url.pathname.includes('/storage/v1/object/share-cards/')) cardUploads.push({ path: url.pathname, bytes: route.request().postDataBuffer()?.length ?? 0 });
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (m && m[1] && m[2] === 'mark_notifications_read') table.notifications.forEach((n) => { n.read_at = new Date().toISOString(); });
    if (url.pathname.endsWith('/functions/v1/session-weather')) body = { weather: { at: kickoff, temp_c: 10, wind_mph: 11, precip_mm: 0.6, symbol: 'lightrain', summary: 'Light rain', icon: 'rainy-outline' } };
    if (m && m[1]) calls.push(m[2]);
    if (m && m[1]) body = rpcs[m[2]] ?? null;
    else if (m) body = table[m[2]] ?? [];
    if (single && Array.isArray(body)) body = body[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { page, errors };
}
for (const [vpName, vp] of Object.entries({ phone: { width: 375, height: 812 }, desktop: { width: 1366, height: 900 } })) {
  // STORE_SHOTS=1 also saves crisp phone-sized captures for the Play Store screenshots
  const store = process.env.STORE_SHOTS === '1' && vpName === 'phone';
  table.notifications.forEach((n) => { n.read_at = null; });
  const { page, errors } = await openPage(vp, { dpr: store ? 2 : 1 });
  for (const [name, path, expected] of [
    ['home', '/', process.env.STORE_SHOTS === '1' ? 'KICK-OFF IN' : 'Next up'], ['session', `/session/${SID}`, 'Host controls'], ['lineup', `/session/${SID}/lineup`, 'Balance teams'],
    ['leagues', '/leagues', 'My groups'], ['profile', '/profile', '100% RELIABLE'], ['create', '/create', 'New game'],
    ['payments', `/session/${SID}/payments`, 'Host dashboard'], ['settings', '/settings', 'Terms of Use'],
    ['notifications', '/notifications', 'Notifications'], ['privacy', '/legal/privacy', 'Privacy Policy'],
    ['terms', '/legal/terms', 'Terms of Use'], ['delete', '/legal/delete-account', 'Delete your account'],
    ['find', '/session/find', 'Find a game'],
    ['group-new', '/group/new', 'Who can join'],
    ['group', `/group/${GID}`, 'Player of the Month'],
    ['session-new', '/session/new', 'Postcode'],
    ['done-redirect', `/done?kind=paid&session=${SID}`, 'Host dashboard'],
    ['achievements', '/achievements', 'Customise your card'],
    ['help', '/help', 'Help & FAQ'],
    ['edit-profile', '/settings/profile', 'Club you support'],
    ['group-settings', `/group/${GID}/settings`, 'Members ·'],
    ['invite', `/session/${SID}/invite`, 'Message for your group chat'],
  ]) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (name === 'home') {
      const t = await page.locator('body').innerText();
      if (!t.includes('1 MOTM award from Gold in Man of the Match')) failures.push(`${vpName}: nearly-there nudge missing`);
      if (!t.includes('The host removed you from Sunday Kickabout') || !t.includes('Too many no-shows')) failures.push(`${vpName}: removal notice not shown`);
      if (t.includes('Add a profile photo')) failures.push(`${vpName}: get started checklist shown to an established player`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-kicked-notice.png`) });
      await page.getByRole('button', { name: 'OK' }).last().click();
      await page.waitForTimeout(300);
      if ((await page.locator('body').innerText()).includes('The host removed you from')) failures.push(`${vpName}: removal notice did not dismiss`);
    }
    if (name === 'profile' && vpName === 'phone') {
      // your card is saved as a picture for your invite-link preview
      await page.waitForTimeout(3500);
      const up = cardUploads.find((u) => u.path.endsWith(`/${ME}/card.jpg`));
      if (!up || up.bytes < 5000) failures.push(`${vpName}: card picture not saved for link previews (${JSON.stringify(cardUploads)})`);
      else if (!calls.includes('set_card_image')) failures.push(`${vpName}: card picture not recorded`);
    }
    if (name === 'profile' && !(await page.getByLabel('Title: Baller').count())) failures.push(`${vpName}: card title missing`);
    if (name === 'profile' && !(await page.getByLabel(/^Medals: Goals Gold, Man of the Match Silver, Season Champion Legend/).count())) failures.push(`${vpName}: card medals missing`);
    if (name === 'achievements') {
      // Compare: one swipe for where from, then tap a side and search for a player
      table.friendships = people.slice(1, 6).map((p) => ({ user_a: ME, user_b: p.id, a: people[0], b: p }));
      await page.goto(base + '/compare', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /^Pick Player B/ }).click();
      await page.waitForTimeout(300);
      await page.getByPlaceholder('Search by name or @username').fill('jor');
      await page.waitForTimeout(200);
      const listed = await page.locator('body').innerText();
      if (!/Jordan Pike/.test(listed) || /Chris Obi/.test(listed)) failures.push(`${vpName}: compare search not filtering`);
      await page.getByText('Jordan Pike').last().click();
      await page.waitForTimeout(500);
      if (!(await page.getByRole('button', { name: /^Player B: Jordan Pike/ }).count())) failures.push(`${vpName}: compare pick not applied`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-compare.png`) });
      table.friendships = [];
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    }
    if (name === 'group-settings') {
      // one About box (no separate rules), compact rows, members open a small sheet
      const t = await page.locator('body').innerText();
      if (/Make admin|Make moderator/.test(t) || !/About/.test(t) || !/game rules/i.test(t)) failures.push(`${vpName}: group settings layout unexpected`);
      await page.getByRole('button', { name: 'Delete group' }).click();
      await page.waitForTimeout(400);
      if (!/Delete Wednesday Football\?/.test(await page.locator('body').innerText())) failures.push(`${vpName}: no confirmation before deleting a group`);
      await page.getByRole('button', { name: 'Keep it' }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-group-settings.png`), fullPage: true });
      // first group: a quick skippable tour, ending in the invite sheet; ? replays it
      await page.goto(base + `/group/${GID}?new=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      if (!/Bring your squad/.test(await page.locator('body').innerText())) failures.push(`${vpName}: group tour not shown`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-group-tour.png`) });
      for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: 'Next' }).last().click(); await page.waitForTimeout(450); }
      if (!/Need this again\?/.test(await page.locator('body').innerText())) failures.push(`${vpName}: group tour steps missing`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-group-tour-last.png`) });
      await page.getByRole('button', { name: 'Invite my squad' }).click();
      await page.waitForTimeout(600);
      if (!/Invite players to/.test(await page.locator('body').innerText())) failures.push(`${vpName}: tour didn't lead to inviting`);
      await page.goto(base + `/group/${GID}?new=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      if (/Bring your squad/.test(await page.locator('body').innerText())) failures.push(`${vpName}: group tour shown twice`);
      await page.getByRole('button', { name: 'How this page works' }).click();
      await page.waitForTimeout(900);
      if (!/Bring your squad/.test(await page.locator('body').innerText())) failures.push(`${vpName}: tour didn't replay`);
      await page.getByText('Skip', { exact: true }).click();
      await page.waitForTimeout(400);
      if (/Bring your squad/.test(await page.locator('body').innerText())) failures.push(`${vpName}: tour didn't skip`);
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    }
    if (name === 'edit-profile') {
      calls.length = 0;
      // your card is on top; tapping a locked style previews it on the card with how close you are
      await page.getByRole('button', { name: /^Hall of Fame card/ }).click();
      await page.waitForTimeout(500);
      const t = await page.locator('body').innerText();
      if (!/HALL OF FAME/.test(t) || !/Preview/.test(t) || !/Hall of Fame unlocks at 40 medal points/.test(t)) failures.push(`${vpName}: locked style preview missing`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-card-preview.png`) });
      await page.getByRole('button', { name: /^Crimson card/ }).click();
      await page.waitForTimeout(300);
      if (!/Crimson\n/.test(await page.locator('body').innerText()) || /Hall of Fame unlocks/.test(await page.locator('body').innerText())) failures.push(`${vpName}: base colour not applied`);
      // nothing is saved until Save; leaving asks first
      if (calls.includes('set_card_style')) failures.push(`${vpName}: card style saved before pressing Save`);
      await page.getByRole('button', { name: 'Back' }).first().click();
      await page.waitForTimeout(400);
      if (!/Discard your changes\?/.test(await page.locator('body').innerText())) failures.push(`${vpName}: no discard prompt when leaving with changes`);
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await page.waitForTimeout(300);
      if (!/Edit profile/.test(await page.locator('body').innerText())) failures.push(`${vpName}: 'Keep editing' left the page`);
      if (!/Medals on your card · 3\/3/.test(await page.locator('body').innerText())) failures.push(`${vpName}: medal chooser missing`);
      // titles: a locked one previews on the card with what unlocks it
      await page.getByText('Main Character', { exact: true }).last().click();
      await page.waitForTimeout(300);
      const tt = await page.locator('body').innerText();
      if (!/Preview · to unlock “Main Character”: Win MOTM 50 times/.test(tt) || !(await page.getByLabel('Title: Main Character').count())) failures.push(`${vpName}: locked title preview missing`);
      await page.getByText('Edit profile').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: join(OUT, `auth-${vpName}-card-title.png`) });
      calls.length = 0;
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.waitForTimeout(800);
      if (!calls.includes('set_card_style') || calls.includes('set_card_title')) failures.push(`${vpName}: Save didn't save the card style (or saved a locked title): ${calls.join(',')}`);
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    }
    if (name === 'create') {
      await page.goto(base + '/session/new', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /^Date: / }).first().click();
      await page.waitForTimeout(400);
      const t = await page.locator('body').innerText();
      if (!/Pick a date/.test(t) || !/Mon/.test(t)) failures.push(`${vpName}: calendar did not open`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-calendar.png`) });
      await page.getByRole('button', { name: 'Next month' }).click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day 15 / }).first().click();
      await page.waitForTimeout(600);
      if (!/15 /.test(await page.locator('body').innerText())) failures.push(`${vpName}: picked date not shown`);
      // typing a time puts the colon in
      const timeBox = page.getByLabel('Kick-off time');
      await timeBox.fill('');
      await timeBox.pressSequentially('2045');
      if ((await timeBox.inputValue()) !== '20:45') failures.push(`${vpName}: typed time not formatted (${await timeBox.inputValue()})`);
      // format and length are single swipe controls; no max-players or area fields
      const ft = await page.locator('body').innerText();
      if (!ft.includes('5-a-side') || !ft.includes('1 hour') || /Maximum players|Area \/ address/.test(ft)) failures.push(`${vpName}: session form layout unexpected`);
      await page.getByRole('button', { name: 'Next option' }).nth(1).click();
      await page.waitForTimeout(250);
      if (!(await page.locator('body').innerText()).includes('6-a-side')) failures.push(`${vpName}: format did not change`);
      // only the essentials: no MOTM, deadline or repeat options; a star saves it as a preset
      if (/Can’t-make-it deadline|Every game|Every week|More options/.test(ft)) failures.push(`${vpName}: session form still has removed options`);
      await page.getByRole('checkbox', { name: 'Save as a preset' }).click();
      await page.waitForTimeout(200);
      if (!/Saved as a preset too/.test(await page.locator('body').innerText())) failures.push(`${vpName}: preset star did not toggle`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-session-form.png`), fullPage: vpName === 'phone' });
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    }
    if (name === 'group') {
      await page.getByText('Player of the Month').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.getByText('C = Player of the Month').first().locator('xpath=../..').screenshot({ path: join(OUT, `auth-${vpName}-team-of-month.png`) }).catch(() => undefined);
    }
    if (name === 'settings') {
      await page.getByText('Sync with my calendar').first().click();
      await page.waitForTimeout(600);
      const ct = await page.locator('body').innerText();
      if (!ct.includes('Google Calendar') || !ct.includes('cancelled games disappear')) failures.push(`${vpName}: calendar sync sheet missing`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-calendar-sync.png`) });
      await page.getByRole('button', { name: 'Close' }).last().click();
      await page.waitForTimeout(300);
    }
    if (name === 'leagues') {
      const lt = await page.locator('body').innerText();
      if (!lt.includes('Join group') || !lt.includes('Alex Reid invited you')) failures.push(`${vpName}: group invitation not shown`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-group-invites.png`) });
      await page.getByText('Leaderboards').first().click();
      await page.waitForTimeout(500);
      if (!/Not qualified yet/i.test(await page.locator('body').innerText())) failures.push(`${vpName}: not-qualified section missing`);
      await page.getByText(/Not qualified yet/i).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT, `auth-${vpName}-leaderboard-pending.png`) });
      // drop two places, look again: the change is shown once
      const mine = lb.find((r) => r.is_me);
      const was = mine.rank;
      lb.filter((r) => r.qualified && r.rank <= 3).forEach((r) => { r.rank = r.is_me ? 3 : r.rank + (r.rank < 3 ? 1 : 0) - (r.rank === 3 ? 2 : 0); });
      await page.goto(base + '/leagues', { waitUntil: 'networkidle' });
      await page.getByText('Leaderboards').first().click();
      await page.waitForTimeout(1200);
      if (!/Down 2/.test(await page.locator('body').innerText())) failures.push(`${vpName}: table position change not shown`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-rank-change.png`) });
      lb.forEach((r) => { if (r.qualified && r.rank <= 3) r.rank = r.is_me ? was : r.rank; });
      lb.filter((r) => r.qualified).sort((a, b) => b.value - a.value).forEach((r, i) => { r.rank = i + 1; });
    }
    if (name === 'session') {
      const text0 = await page.locator('body').innerText();
      if (!/Guest request: Marco/i.test(text0)) failures.push(`${vpName}: guest request not shown`);
      // squad is faces + names; the full list (with guests) opens on demand
      await page.getByText('See squad').first().click();
      await page.waitForTimeout(300);
      const squadText = await page.locator('body').innerText();
      if (!/Dave/.test(squadText)) failures.push(`${vpName}: guest not in squad`);
      if (!/77% reliable/.test(squadText) || /95% reliable/.test(squadText)) failures.push(`${vpName}: host reliability warning wrong`);
      // host tools: one next step, the rest in a list
      if (!/Pick the teams|Full time: enter the scores/.test(text0)) failures.push(`${vpName}: host next step missing`);
      await page.getByRole('button', { name: 'More host tools' }).click();
      await page.waitForTimeout(300);
      const tools = await page.locator('body').innerText();
      if (!tools.includes('Line-ups') || !tools.includes('Cancel game') || tools.includes('Repeat next week')) failures.push(`${vpName}: host tools list incomplete`);
      if (!(await page.getByRole('button', { name: 'Save as a preset' }).count())) failures.push(`${vpName}: preset star missing`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-host-tools.png`) });
      await page.getByRole('button', { name: 'Close' }).last().click();
      await page.waitForTimeout(300);
      if (!/Watch the game/i.test(text0)) failures.push(`${vpName}: match videos section missing`);
      if (!/10°C · Light rain/.test(text0)) failures.push(`${vpName}: kick-off weather missing`);
      if (!/Squad complete/.test(text0)) failures.push(`${vpName}: squad complete missing`);
      await page.getByRole('button', { name: 'Can’t make it' }).first().click();
      await page.waitForTimeout(400);
      if (!(await page.locator('body').innerText()).includes('Can’t make it anymore?')) failures.push(`${vpName}: in-app confirm sheet did not open`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-confirm-sheet.png`) });
      await page.getByRole('button', { name: 'Cancel' }).last().click();
      await page.waitForTimeout(300);
    }
    const text = await page.locator('body').innerText();
    if (!text.toLowerCase().includes(expected.toLowerCase())) failures.push(`${vpName} ${path}: expected "${expected}"`);
    const nested = await page.evaluate(() => document.querySelectorAll('button button, a button, button a').length);
    if (nested) failures.push(`${vpName} ${path}: ${nested} interactive element(s) nested inside a button (invalid HTML)`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollW > vp.width + 1) failures.push(`${vpName} ${path}: horizontal overflow (${scrollW}px)`);
    if (store && ['home', 'session', 'lineup', 'achievements', 'profile', 'group', 'payments'].includes(name)) {
      await mkdir(join(OUT, 'store-raw'), { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      // the group shot shows the Dream Team
      if (name === 'group') await page.getByText(/Dream Team/).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(name === 'group' ? 1200 : 200);
      await page.screenshot({ path: join(OUT, 'store-raw', `${name}.png`) });
    }
    await page.screenshot({ path: join(OUT, `auth-${vpName}-${name}.png`), fullPage: vpName === 'phone' });
  }
  // welcome moment when you've just joined a group
  {
    const before = table.group_members;
    table.group_members = people.map((p, i) => ({ role: i === 0 ? 'member' : i === 1 ? 'owner' : 'member', user_id: p.id, joined_at: i === 0 ? ago(0.01) : ago(300 - i), profile: p,
      group: { id: GID, name: 'Wednesday Football', logo_url: null, location: 'Hackney', group_members: [{ count: 10 }] } }));
    await page.goto(base + `/group/${GID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const wt = await page.locator('body').innerText();
    if (!wt.includes('Welcome to Wednesday Football') || !/player #10 of 10/.test(wt) || !wt.includes('are already here')) failures.push(`${vpName}: group welcome not shown`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-group-welcome.png`) });
    await page.getByRole('button', { name: 'See the game' }).click().catch(() => failures.push(`${vpName}: group welcome has no next game button`));
    await page.waitForTimeout(500);
    // only once
    await page.goto(base + `/group/${GID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if ((await page.locator('body').innerText()).includes('Welcome to Wednesday Football')) failures.push(`${vpName}: group welcome shown twice`);
    table.group_members = before;
  }

  // a place offered from the waiting list in the last 24 hours
  {
    const mine = attendance.find((a) => a.user_id === ME);
    const before = { ...mine };
    Object.assign(mine, { status: 'waitlisted', waitlisted_at: ago(1), offer_expires_at: new Date(Date.now() + 25 * 60_000).toISOString() });
    await page.goto(base + `/session/${SID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const ot = await page.locator('body').innerText();
    if (!ot.includes('A place just opened for you') || !/in the next 2\dm/.test(ot)) failures.push(`${vpName}: waiting-list offer not shown`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-offer.png`) });
    // take the place: the card celebrates
    rpcs.respond_to_session = 'confirmed';
    Object.assign(mine, { status: 'confirmed', offer_expires_at: null });
    await page.getByRole('button', { name: 'I’m in' }).first().click();
    await page.waitForTimeout(900);
    if (!(await page.locator('body').innerText()).includes('You’re in! ⚽')) failures.push(`${vpName}: I'm in celebration missing`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-im-in.png`) });
    delete rpcs.respond_to_session;
    Object.keys(mine).forEach((k) => delete mine[k]);
    Object.assign(mine, before);
  }

  // invite links: friend (player card, mutual friends, handshake), group and game
  {
    const friendPreview = { id: people[1].id, username: 'alex', display_name: 'Alex Reid', avatar_url: null, position: 'DEF', nationality: 'GB-SCT',
      supported_club: 'celtic', card_style: 'silver', is_self: false, already_friends: false, medal_points: 11,
      stats: { sessions: 31, fixtures: 70, wins: 39, losses: 21, win_pct: 55.7, goals: 18, assists: 22, motm: 4, rating: '7.40' },
      mutual: [{ display_name: 'Jordan Pike', avatar_url: null }, { display_name: 'Chris Obi', avatar_url: null }], mutual_count: 4 };
    rpcs.get_invite = { valid: true, kind: 'friend', target_id: people[1].id, preview: friendPreview };
    rpcs.accept_invite = { kind: 'friend', target_id: people[1].id, result: 'friends' };
    await page.goto(base + '/invite/abc123def456', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    let it = await page.locator('body').innerText();
    if (!it.includes('Alex wants to play with you') || !it.includes('4 mutual friends') || !it.includes('Add Alex as a friend')) failures.push(`${vpName}: friend invite incomplete`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-invite-friend.png`), fullPage: vpName === 'phone' });
    await page.getByRole('button', { name: 'Add Alex as a friend' }).click();
    await page.waitForTimeout(2600);
    it = await page.locator('body').innerText();
    if (!it.includes('You and Alex are now friends') || !it.includes('Compare our stats')) failures.push(`${vpName}: friends celebration missing`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-invite-friends-now.png`) });

    rpcs.get_invite = { valid: true, kind: 'group', target_id: GID, preview: { name: 'Sunday Kickabout', logo_url: null, location: 'Mill Hill', description: 'Relaxed 6-a-side every Sunday morning.', members: 12, already_member: false, invited_by: 'Alex Reid', faces: people.slice(1, 7).map((p) => ({ display_name: p.display_name, avatar_url: null })) } };
    await page.goto(base + '/invite/grp123def456', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    it = await page.locator('body').innerText();
    if (!it.includes('Alex wants you in Sunday Kickabout') || !it.includes('Join the group')) failures.push(`${vpName}: group invite incomplete`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-invite-group.png`) });

    rpcs.get_invite = { valid: true, kind: 'session', target_id: SID, preview: { name: 'Wednesday Football', starts_at: kickoff, venue: 'Riverside Sports Centre', area: 'NW7 2EU', format_size: 5, status: 'scheduled', payment_mode: 'upfront', price_pence: 600, places_left: 2, max: 10, host: 'Sam Carter', host_avatar: null } };
    await page.goto(base + '/invite/ses123def456', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    it = await page.locator('body').innerText();
    if (!it.includes('Sam wants you to play') || !it.includes('2 of 10 places left') || !it.includes('Nearly full')) failures.push(`${vpName}: game invite incomplete`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-invite-game.png`) });
    delete rpcs.get_invite;
    delete rpcs.accept_invite;
  }

  // making friends inside the app: accepting a request, and the other side finding out
  {
    const savedReq = table.friend_requests;
    table.friend_requests = [{ id: 'fr1', created_at: ago(0.1), profile: people[4] }];
    await page.goto(base + '/friends', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByText('Requests').first().click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Accept' }).first().click();
    await page.waitForTimeout(2600);
    let ft = await page.locator('body').innerText();
    if (!ft.includes('You and Danny are now friends')) failures.push(`${vpName}: handshake after accepting a request missing`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-handshake-accept.png`) });
    await page.getByRole('button', { name: 'Done' }).click();
    table.friend_requests = savedReq;

    // my request was accepted: I get the handshake too (once)
    await page.evaluate((uid) => localStorage.setItem(`matchday.friendsCelebrated.${uid}`, new Date(Date.now() - 3600_000).toISOString()), ME);
    table.notifications.push({ id: 'n-fa', user_id: ME, type: 'friend_accepted', title: 'Friend request accepted', body: 'Ravi accepted', data: { user_id: people[6].id }, read_at: null, created_at: new Date().toISOString() });
    await page.goto(base + '/matches', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600);
    ft = await page.locator('body').innerText();
    // (the test server answers every profile lookup with the same player, so only the wording is checked)
    if (!/You and \w+ are now friends/.test(ft)) failures.push(`${vpName}: handshake for an accepted request missing`);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(300);
    await page.goto(base + '/matches', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    if ((await page.locator('body').innerText()).includes('are now friends')) failures.push(`${vpName}: friend handshake shown twice`);
    table.notifications = table.notifications.filter((n) => n.id !== 'n-fa');

    // several accepted while I was away: one combined moment, not one each
    const profilesBefore = table.profiles.length;
    table.profiles.push(people[4], people[6], people[7]);
    for (const [i, p] of [people[4], people[6], people[7]].entries()) {
      table.notifications.push({ id: `n-fb${i}`, user_id: ME, type: 'friend_accepted', title: 'Friend request accepted', body: '', data: { user_id: p.id }, read_at: null, created_at: new Date(Date.now() + i * 1000).toISOString() });
    }
    await page.goto(base + '/matches', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    ft = await page.locator('body').innerText();
    if (!/You’ve got \d+ new friends/.test(ft) || /are now friends/.test(ft)) failures.push(`${vpName}: combined new-friends moment missing`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-new-friends.png`) });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(300);
    await page.goto(base + '/matches', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    if (/new friends|are now friends/.test(await page.locator('body').innerText())) failures.push(`${vpName}: new-friends moment shown twice`);
    table.profiles.splice(profilesBefore);
    table.notifications = table.notifications.filter((n) => !String(n.id).startsWith('n-fb'));
  }

  // teams reveal: a player (not the host) opening confirmed line-ups
  {
    rpcs.is_session_manager = false;
    await page.goto(base + `/session/${SID}/lineup`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600);
    const tt = await page.locator('body').innerText();
    if (!tt.includes('Teams are out') || !tt.includes('You’re on Bibs')) failures.push(`${vpName}: teams reveal not shown`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-teams-reveal.png`) });
    await page.getByRole('button', { name: 'See the pitch' }).click();
    rpcs.is_session_manager = true;
  }

  // finalised session: the shareable match report
  {
    const saved = { status: session.status, fixtures: JSON.stringify(fixtures), t: { ...table } };
    session.status = 'finalised';
    session.finalised_at = ago(0.1);
    fixtures[0].played = true; fixtures[0].teams[0].score = 7; fixtures[0].teams[1].score = 5;
    table.motm_awards = [{ user_id: people[2].id, fixture_id: null, votes: 6, shared: false }];
    table.player_goals = [{ user_id: ME, fixture_id: FID, goals: 2, assists: 1 }, { user_id: people[2].id, fixture_id: FID, goals: 3, assists: 0 }, { user_id: people[6].id, fixture_id: FID, goals: 1, assists: 2 }];
    table.session_player_statistics = [{ user_id: ME, rating_avg: '8.20', rating_eligible: true, goals: 2, motm: false }];
    await page.goto(base + `/session/${SID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (!/And the Man of the Match is/.test(await page.locator('body').innerText())) failures.push(`${vpName}: MOTM announcement missing`);
    await page.waitForTimeout(2400);
    if (!/Jordan Pike[\s\S]*6 votes/.test(await page.locator('body').innerText())) failures.push(`${vpName}: MOTM not revealed`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-motm.png`) });
    await page.getByRole('button', { name: 'Nice' }).click();
    await page.waitForTimeout(400);
    const rt = await page.locator('body').innerText();
    if (!rt.includes('Share match report') || !rt.includes('matchdayapp.org') || !/8\.2 rating · 2 goals · 1 assist/.test(rt)) failures.push(`${vpName}: match report card incomplete`);
    await page.getByText('matchdayapp.org').first().locator('xpath=../../..').screenshot({ path: join(OUT, `auth-${vpName}-match-report.png`) }).catch(() => undefined);
    // goals page: team totals for the host, and correcting a tally includes assists
    table.goal_submissions = [{ id: 's-2', session_id: SID, user_id: people[2].id, goals: 3, assists: 0, approved_goals: 3, approved_assists: 0, status: 'approved', fixture_breakdown: null, note: null, is_late: false, submitted_at: ago(0.2) }];
    await page.goto(base + `/session/${SID}/goals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const gt = await page.locator('body').innerText();
    if (!/Team totals/.test(gt) || !/scored 7: 5 ⚽ 1 🅰️ credited · 2 goals not credited yet/.test(gt)) failures.push(`${vpName}: team totals missing on the goals page`);
    await page.getByRole('button', { name: 'Own goal / no scorer' }).first().click();
    await page.waitForTimeout(400);
    if (!(await page.getByLabel('Goals with no scorer').count())) failures.push(`${vpName}: own goal / no scorer sheet missing`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-goals-unassigned.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Correct' }).first().click();
    await page.waitForTimeout(500);
    if (!(await page.getByLabel('Corrected assists').count())) failures.push(`${vpName}: correcting goals has no assists`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-goals-correct.png`) });
    await page.keyboard.press('Escape');
    session.status = saved.status;
    delete session.finalised_at;
    fixtures.splice(0, fixtures.length, ...JSON.parse(saved.fixtures));
    for (const k of Object.keys(table)) if (!(k in saved.t)) delete table[k];
    Object.assign(table, saved.t);
  }

  // the host saves a game's score: straight to "what's next?" (new fair teams, same teams, or full time)
  {
    await page.goto(base + `/session/${SID}/results`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Save score' }).first().click();
    await page.waitForTimeout(700);
    const wt = await page.locator('body').innerText();
    if (!/Game 1 done\. What’s next\?/.test(wt) || !wt.includes('Game 2: new fair teams') || !wt.includes('That’s it, full time')) failures.push(`${vpName}: what's next sheet missing after saving a score`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-whats-next.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // after a finalised game: the match reveal comes first, then medal level-ups
  rpcs.get_match_reveals = [reveal];
  await page.evaluate((uid) => localStorage.setItem(`matchday.achievementsSeen.${uid}`, new Date(Date.now() - 3 * 86400_000).toISOString()), ME);
  await page.goto(base + '/achievements', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  let ct = await page.locator('body').innerText();
  if (!/Your match/i.test(ct) || !ct.includes('Man of the Match') || !ct.includes('3 goals') || !ct.includes('8.4') || ct.includes('Level up')) failures.push(`${vpName}: match reveal not shown first`);
  if (ct.includes('assists') && ct.includes('The most you’ve set up')) failures.push(`${vpName}: equalled assists shown as a record`);
  await page.screenshot({ path: join(OUT, `auth-${vpName}-match-reveal.png`) });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  ct = await page.locator('body').innerText();
  if (!ct.includes('Season Champion') || !ct.includes('Next (1 more)')) failures.push(`${vpName}: unlock celebration not shown`);
  await page.screenshot({ path: join(OUT, `auth-${vpName}-celebration.png`) });
  await page.getByRole('button', { name: /Next \(1 more\)/ }).click();
  await page.waitForTimeout(900);
  ct = await page.locator('body').innerText();
  if (!ct.includes('Big Game') || !/Level up · Gold/i.test(ct)) failures.push(`${vpName}: second unlock not shown`);
  await page.getByRole('button', { name: 'Nice' }).click();
  await page.waitForTimeout(500);
  if (/Level up ·/i.test(await page.locator('body').innerText())) failures.push(`${vpName}: celebration did not close`);
  rpcs.get_match_reveals = [];
  if (errors.length) failures.push(`${vpName}: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
}
// First visit to Home: the app tour (welcome card, each tab, friends, bell, help, done),
// shown once, replayable from ? → Replay the app tour, skippable.
{
  rpcs.get_match_reveals = [];
  const saved = table.notifications;
  table.notifications = [];
  const { page, errors } = await openPage({ width: 375, height: 812 }, { appTour: true });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (!/Welcome to MATCHDAY/.test(await page.locator('body').innerText())) failures.push('app tour: welcome not shown');
  await page.screenshot({ path: join(OUT, 'app-tour-welcome.png') });
  await page.getByRole('button', { name: 'Show me' }).click();
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const t = await page.locator('body').innerText();
    for (const [step, phrase] of [['Create', 'about 30 seconds'], ['Leagues', 'move you up the tables'], ['Your player card', 'Your stats on a card'],
      ['Friends', 'by username or QR code'], ['Help is up here', 'Replay this tour'], ['You’re all set', 'first game in the calendar']]) if (t.includes(phrase) && !seen.includes(step)) seen.push(step);
    if (i === 3) await page.screenshot({ path: join(OUT, 'app-tour-step.png') });
    if (/You’re all set/.test(t)) { await page.screenshot({ path: join(OUT, 'app-tour-done.png') }); await page.getByRole('button', { name: 'Let’s play' }).click(); break; }
    await page.getByRole('button', { name: 'Next' }).last().click();
  }
  for (const want of ['Create', 'Leagues', 'Your player card', 'Help is up here', 'You’re all set']) if (!seen.includes(want)) failures.push(`app tour: step "${want}" missing (saw ${seen.join(', ')})`);
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (/Welcome to MATCHDAY/.test(await page.locator('body').innerText())) failures.push('app tour: shown twice');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByText('Replay the app tour').click();
  await page.waitForTimeout(1200);
  if (!/Welcome to MATCHDAY/.test(await page.locator('body').innerText())) failures.push('app tour: replay not working');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(500);
  if (/Welcome to MATCHDAY/.test(await page.locator('body').innerText())) failures.push('app tour: skip not working');
  if (errors.length) failures.push(`app tour: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
  table.notifications = saved;
}

// Screen tips: each screen's tour plays once the first time you open it (after the app tour),
// the help button replays it, and it can be skipped.
{
  rpcs.get_match_reveals = [];
  const saved = table.notifications;
  table.notifications = [];
  const { page, errors } = await openPage({ width: 375, height: 812 }, { tips: true });
  await page.goto(base + '/matches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (!/Your matches/.test(await page.locator('body').innerText())) failures.push('screen tips: matches tour not shown');
  await page.screenshot({ path: join(OUT, 'tips-matches-intro.png') });
  await page.getByRole('button', { name: /^(Show me|Next)$/ }).last().click();
  let pointed = 0;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const t = await page.locator('body').innerText();
    if (/Public games near a postcode|Switch between games coming up|Tap a game/.test(t)) pointed++;
    if (i === 0) await page.screenshot({ path: join(OUT, 'tips-matches-step.png') });
    if (/Help is always here/.test(t)) { await page.screenshot({ path: join(OUT, 'tips-matches-help.png') }); await page.getByRole('button', { name: 'Got it' }).click(); break; }
    await page.getByRole('button', { name: 'Next' }).last().click();
  }
  if (pointed < 2) failures.push(`screen tips: matches tour didn't point at its buttons (${pointed})`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (/Your matches/.test(await page.locator('body').innerText())) failures.push('screen tips: shown twice');
  await page.getByRole('button', { name: 'How Matches works' }).click();
  await page.waitForTimeout(1000);
  if (!/Your matches/.test(await page.locator('body').innerText())) failures.push('screen tips: help button did not replay');
  // "Don't show tips again": switches tips off and says where to turn them back on
  await page.getByRole('button', { name: 'Don’t show tips again' }).click();
  await page.waitForTimeout(400);
  const off = await page.locator('body').innerText();
  if (!off.includes('Tips are off') || !off.includes('Settings → Tips on new screens')) failures.push('screen tips: turning tips off did not explain where to turn them back on');
  if ((await page.evaluate(() => localStorage.getItem('matchday.tips'))) !== 'off') failures.push('screen tips: "Don’t show tips again" did not switch tips off');
  await page.screenshot({ path: join(OUT, 'tips-off.png') });
  await page.getByRole('button', { name: 'OK' }).click();
  await page.evaluate(() => localStorage.setItem('matchday.tips', 'on'));
  await page.waitForTimeout(400);
  // the new-session form points at its controls
  await page.goto(base + '/session/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (!/Only the essentials/.test(await page.locator('body').innerText())) failures.push('screen tips: new session tour not shown');
  await page.getByRole('button', { name: /^(Show me|Next)$/ }).last().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'tips-session-new.png') });
  if (!/Something your squad will recognise/.test(await page.locator('body').innerText())) failures.push('screen tips: new session first step missing');
  if (errors.length) failures.push(`screen tips: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
  table.notifications = saved;
}

// Every screen's tour, step by step at Galaxy S8 size: the spotlight must sit exactly on the
// thing the step describes (no drifting onto the wrong field), and the bubble must be on screen.
{
  rpcs.get_match_reveals = [];
  const saved = table.notifications;
  table.notifications = [];
  table.friendships = people.slice(1, 6).map((p) => ({ user_a: ME, user_b: p.id, a: people[0], b: p }));
  const TOUR_PAGES = [
    ['matches', '/matches'], ['leagues', '/leagues'], ['create', '/create'], ['profile', '/profile'], ['session', `/session/${SID}`],
    ['session-new', '/session/new'], ['friends', '/friends'], ['achievements', '/achievements'], ['edit-profile', '/settings/profile'],
    ['compare', '/compare'], ['find', '/session/find'], ['lineup', `/session/${SID}/lineup`], ['group-settings', `/group/${GID}/settings`],
    ['settings', '/settings'], ['vote', `/session/${SID}/vote`], ['notifications', '/notifications'], ['payments', '/payments'],
  ];
  const { page, errors } = await openPage({ width: 360, height: 740 }, { tips: true });
  const report = [];
  for (const [tour, path] of TOUR_PAGES) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const checked = [];
    for (let i = 0; i < 20; i++) {
      const state = await page.evaluate(() => {
        const ring = document.querySelector('[id^="ring-"]');
        const btn = [...document.querySelectorAll('[role="button"]')].map((b) => b.textContent?.trim()).filter((t) => /^(Show me|Next|Got it)$/.test(t ?? ''));
        if (!ring) return { ring: null, btn };
        const id = ring.id.slice(5);
        const r = ring.getBoundingClientRect();
        const spot = document.getElementById(`spot-${id}`);
        const t = spot?.getBoundingClientRect();
        return { ring: id, btn, r: { x: r.left, y: r.top, w: r.width, h: r.height }, t: t ? { x: t.left, y: t.top, w: t.width, h: t.height } : null, vh: innerHeight };
      });
      if (state.ring && state.ring !== 'step') {
        checked.push(state.ring);
        if (!state.t) failures.push(`tour ${tour}: step ${state.ring} has no target on screen`);
        // the ring is the target plus 6px padding (it pulses, so allow a little)
        // compare centres (the ring pulses in size); tall targets are lit from the top (40% of the screen)
        else if (Math.abs((state.r.x + state.r.w / 2) - (state.t.x + state.t.w / 2)) > 3
          || Math.abs((state.r.y + state.r.h / 2) - (state.t.y - 6 + (Math.min(state.t.h, state.vh * 0.4) + 12) / 2)) > 3) {
          failures.push(`tour ${tour}: spotlight off target on ${state.ring} (ring y=${Math.round(state.r.y)}, target y=${Math.round(state.t.y)})`);
          await page.screenshot({ path: join(OUT, `tour-off-${tour}-${state.ring}.png`) });
        }
        if (state.r.y > state.vh || state.r.y + Math.min(state.r.h, state.vh * 0.4) < 0) failures.push(`tour ${tour}: ${state.ring} spotlight off screen`);
      }
      const nextBtn = page.getByRole('button', { name: /^(Show me|Next|Got it)$/ });
      if (!(await nextBtn.count())) { if (i > 0 && !state.ring) break; await page.waitForTimeout(800); continue; }
      const label = (await nextBtn.last().getAttribute('aria-label')) ?? (await nextBtn.last().innerText());
      await page.getByRole('button', { name: /^(Show me|Next|Got it)$/ }).last().click();
      await page.waitForTimeout(1500);
      if (label === 'Got it') break;
    }
    report.push(`${tour}: ${checked.join(', ')}`);
    if (!checked.length && !['vote', 'notifications', 'payments'].includes(tour)) failures.push(`tour ${tour}: didn't play`);
  }
  await (await import('node:fs/promises')).writeFile(join(OUT, 'tours.txt'), report.join('\n'));
  if (errors.length) failures.push(`tours: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
  table.notifications = saved;
  table.friendships = [];
}

// No signal at the pitch: what you'd loaded is still there after a restart, with a banner.
{
  rpcs.get_match_reveals = [];
  const saved = table.notifications;
  table.notifications = [];
  const { page, errors } = await openPage({ width: 375, height: 812 });
  await page.goto(base + `/session/${SID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500); // saved a few seconds after loading
  await page.route(/example\.supabase\.co/, (r) => r.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const t = await page.locator('body').innerText();
  if (!/Wednesday Football/.test(t) || !/Riverside Sports Centre/.test(t)) failures.push('offline: saved game page not shown without signal');
  if (!/Offline · showing what was saved/.test(t)) failures.push('offline: no offline banner');
  await page.screenshot({ path: join(OUT, 'offline-session.png') });
  await page.close();
  table.notifications = saved;
  void errors;
}

// Fit pass: every screen at small phone → desktop widths, dark and light. Flags anything that
// pokes out sideways (a horizontal page scroll, or a visible element past the screen edge that
// isn't inside something meant to scroll sideways or clip).
const FIT_ROUTES = [
  '/', '/matches', '/leagues', '/profile', '/create', '/achievements', '/compare', '/friends', '/notifications', '/payments', '/wrapped',
  `/player/${people[1].id}`, `/group/${GID}`, `/group/${GID}/settings`, '/group/discover', '/group/new',
  `/session/${SID}`, `/session/${SID}/lineup`, `/session/${SID}/attendance`, `/session/${SID}/results`, `/session/${SID}/goals`,
  `/session/${SID}/vote`, `/session/${SID}/invite`, `/session/${SID}/payments`, `/session/${SID}/edit`, '/session/new', '/session/find',
  '/settings', '/settings/profile', '/settings/notifications', '/settings/payouts', '/settings/blocked', '/help', '/legal/terms',
  '/invite/abc123def456', '/invite/grp123def456', '/invite/ses123def456',
];
const FIT_SIZES = (process.env.FIT_SIZES ?? '320x640,360x740,414x896,768x1024,1366x900').split(',').map((x) => x.split('x').map(Number));
const offenders = async (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) || /(auto|scroll|hidden|clip)/.test(cs.overflow)) {
        const r = p.getBoundingClientRect();
        if (r.left >= -1 && r.right <= vw + 1) return true;
      }
    }
    return false;
  };
  for (const el of document.body.querySelectorAll('div, span, img, svg, input, textarea')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none' && !el.textContent?.trim()) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) out.push(`${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 50)} [${Math.round(r.left)}–${Math.round(r.right)}]`);
    if (out.length > 4) break;
  }
  // text squeezed into an unreadable column
  for (const el of document.body.querySelectorAll('div[dir="auto"]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.width < 18 && (el.textContent ?? '').trim().length > 3) { out.push(`squashed text "${el.textContent.trim().slice(0, 30)}" (${Math.round(r.width)}px)`); break; }
  }
  return out;
});
// text cut off with "…" (single-line text that doesn't fit); listed for review, not a failure
const truncated = async (page) => page.evaluate(() => [...document.body.querySelectorAll('div[dir="auto"]')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis' && el.getBoundingClientRect().width > 0)
  .map((el) => el.textContent.trim().slice(0, 60)));
const truncReport = [];
if (process.env.SKIP_FIT !== '1') {
  rpcs.get_match_reveals = [];
  table.notifications = table.notifications.filter((n) => n.type !== 'session_removed');
  for (const theme of ['dark', 'light']) {
    for (const [w, h] of FIT_SIZES) {
      const { page, errors } = await openPage({ width: w, height: h }, { theme });
      for (const path of FIT_ROUTES) {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(350);
        const bad = await offenders(page);
        if (bad.length) failures.push(`fit ${w}px ${theme} ${path}: ${bad.join(' | ')}`);
        if (theme === 'dark') { const t = await truncated(page); if (t.length) truncReport.push(`${w}px ${path}: ${t.join(' ¦ ')}`); }
      }
      for (const path of ['/profile', '/settings/profile', `/session/${SID}`, `/group/${GID}`, '/']) {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT, `fit-${w}-${theme}${path.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || '-home'}.png`) });
      }
      if (errors.length) failures.push(`fit ${w}px ${theme}: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
      await page.close();
    }
  }
}
if (truncReport.length) await (await import('node:fs/promises')).writeFile(join(OUT, 'truncated.txt'), truncReport.join('\n'));
await browser.close();
server.close();
if (failures.length) { console.error('Visual check FAILED:\n' + failures.join('\n')); process.exit(1); }
console.log(`Visual check passed. Screenshots in ${OUT}`);
