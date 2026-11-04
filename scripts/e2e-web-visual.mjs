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
const kickoff = (() => { const d = new Date(Date.now() + 86400_000); d.setHours(19, 0, 0, 0); return d.toISOString(); })();
const session = { id: SID, group_id: GID, host_id: ME, name: 'Wednesday Football', starts_at: kickoff, duration_minutes: 60, venue: 'Riverside Sports Centre, Pitch 2', location: 'London', format_size: 5, max_attendance: 10, visibility: 'group', description: 'Bring both bibs.', payment_mode: 'upfront', price_pence: 600, currency: 'gbp', mode: 'single', motm_mode: 'session', status: 'scheduled', rsvp_deadline: null, voting_closes_at: null, template_id: null, host_confirmed_at: null };
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
  profiles: [{ ...people[0], onboarded: true, bio: 'Left foot only.', created_at: '2026-01-01T00:00:00Z', terms_version: LEGAL_VERSION, terms_accepted_at: '2026-11-01T00:00:00Z', card_style: 'gold' }],
  session_videos: [{ id: 'v1', session_id: SID, video_id: 'dQw4w9WgXcQ', title: 'Game 1', added_by: ME, created_at: kickoff }],
  payments: [],
  session_guests: [{ id: 'g1111111-1111-4111-8111-111111111111', session_id: SID, name: 'Dave', added_by: people[1].id, status: 'confirmed', created_at: kickoff },
                   { id: 'g2222222-2222-4222-8222-222222222222', session_id: SID, name: 'Marco', added_by: people[2].id, status: 'pending', created_at: kickoff }],
  sessions: [session], session_attendance: attendance, session_invitations: [], fixtures, session_hosts: [], goal_submissions: [], player_goals: [],
  motm_awards: [], session_player_statistics: [], groups: [{ id: GID, name: 'Wednesday Football', logo_url: null }],
  notifications: [{ id: 'n1', type: 'session_removed', title: 'Removed from Sunday Kickabout', body: '', data: { session_id: SID, session_name: 'Sunday Kickabout', reason: 'Too many no-shows' }, read_at: null, created_at: kickoff }], activity_feed: [],
  group_members: [{ role: 'owner', group: { id: GID, name: 'Wednesday Football', logo_url: null, location: 'Hackney', group_members: [{ count: 14 }] } }],
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
  get_match_reveals: [],
  get_personal_bests: {
    best_rating: { value: '8.60', session_id: SID, name: 'Tuesday 6-a-side', played_at: ago(40) },
    most_goals: { value: 4, session_id: SID, name: 'Wednesday Football', played_at: ago(12) },
    most_assists: null, best_win_streak: 6, best_unbeaten: 9, best_weeks: 9,
  },
  get_my_achievements: myAchievements,
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
for (const [vpName, vp] of Object.entries({ phone: { width: 375, height: 812 }, desktop: { width: 1366, height: 900 } })) {
  // STORE_SHOTS=1 also saves crisp phone-sized captures for the Play Store screenshots
  const store = process.env.STORE_SHOTS === '1' && vpName === 'phone';
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: store ? 2 : 1 });
  table.notifications.forEach((n) => { n.read_at = null; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([uid]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp, aud: 'authenticated', email: 'sam@example.com' })}.sig`;
    localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: uid, email: 'sam@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
  }, [ME]);
  await page.route(/example\.supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    let body = [];
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (m && m[1] && m[2] === 'mark_notifications_read') table.notifications.forEach((n) => { n.read_at = new Date().toISOString(); });
    if (m && m[1]) body = rpcs[m[2]] ?? null;
    else if (m) body = table[m[2]] ?? [];
    if (single && Array.isArray(body)) body = body[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const [name, path, expected] of [
    ['home', '/', 'Next up'], ['session', `/session/${SID}`, 'Host controls'], ['lineup', `/session/${SID}/lineup`, 'Balance teams'],
    ['leagues', '/leagues', 'My groups'], ['profile', '/profile', 'Most goals in a game'], ['create', '/create', 'New session'],
    ['payments', `/session/${SID}/payments`, 'Host dashboard'], ['settings', '/settings', 'Terms of Use'],
    ['notifications', '/notifications', 'Notifications'], ['privacy', '/legal/privacy', 'Privacy Policy'],
    ['terms', '/legal/terms', 'Terms of Use'], ['delete', '/legal/delete-account', 'Delete your account'],
    ['find', '/session/find', 'Find a game'],
    ['group-new', '/group/new', 'Who can join'],
    ['session-new', '/session/new', 'Postcode'],
    ['done-redirect', `/done?kind=paid&session=${SID}`, 'Host dashboard'],
    ['achievements', '/achievements', 'Hall of Fame'],
  ]) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (name === 'home') {
      const t = await page.locator('body').innerText();
      if (!t.includes('The host removed you from Sunday Kickabout') || !t.includes('Too many no-shows')) failures.push(`${vpName}: removal notice not shown`);
      if (t.includes('Add a profile photo')) failures.push(`${vpName}: get started checklist shown to an established player`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-kicked-notice.png`) });
      await page.getByRole('button', { name: 'OK' }).last().click();
      await page.waitForTimeout(300);
      if ((await page.locator('body').innerText()).includes('The host removed you from')) failures.push(`${vpName}: removal notice did not dismiss`);
    }
    if (name === 'create') {
      await page.goto(base + '/session/new', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.getByText('📅 Pick a date').first().click();
      await page.waitForTimeout(400);
      const t = await page.locator('body').innerText();
      if (!/Pick a date/.test(t) || !/Mon/.test(t)) failures.push(`${vpName}: calendar did not open`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-calendar.png`) });
      await page.getByRole('button', { name: 'Next month' }).click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day 15 / }).first().click();
      await page.waitForTimeout(900);
      if (!/15 /.test(await page.locator('body').innerText())) failures.push(`${vpName}: picked date not shown as a chip`);
      await page.screenshot({ path: join(OUT, `auth-${vpName}-calendar-picked.png`) });
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    }
    if (name === 'leagues') {
      await page.getByText('Leaderboards').first().click();
      await page.waitForTimeout(500);
      if (!/Not qualified yet/i.test(await page.locator('body').innerText())) failures.push(`${vpName}: not-qualified section missing`);
      await page.getByText(/Not qualified yet/i).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT, `auth-${vpName}-leaderboard-pending.png`) });
    }
    if (name === 'session') {
      const text0 = await page.locator('body').innerText();
      if (!/Guest request: Marco/i.test(text0)) failures.push(`${vpName}: guest request not shown`);
      if (!/Dave/.test(text0)) failures.push(`${vpName}: guest not in squad`);
      if (!/Watch the game/i.test(text0)) failures.push(`${vpName}: match videos section missing`);
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
    if (store && ['home', 'session', 'lineup', 'leagues', 'profile', 'payments'].includes(name)) {
      await mkdir(join(OUT, 'store-raw'), { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(OUT, 'store-raw', `${name}.png`) });
    }
    await page.screenshot({ path: join(OUT, `auth-${vpName}-${name}.png`), fullPage: vpName === 'phone' });
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
await browser.close();
server.close();
if (failures.length) { console.error('Visual check FAILED:\n' + failures.join('\n')); process.exit(1); }
console.log(`Visual check passed. Screenshots in ${OUT}`);
