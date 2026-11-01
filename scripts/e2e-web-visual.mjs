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
const names = ['Sam Carter', 'Alex Reid', 'Jordan Pike', 'Chris Obi', 'Danny Shaw', 'Leo Marsh', 'Ravi Patel', 'Tom Wells', 'Nico Ferri', 'Ben Hale'];
const people = names.map((n, i) => ({ id: i === 0 ? ME : `2222222${i}-2222-4222-8222-22222222222${i}`, username: n.split(' ')[0].toLowerCase() + i, display_name: n, avatar_url: null, position: ['GK', 'DEF', 'MID', 'FWD', 'ANY'][i % 5] }));
const SID = '33333333-3333-4333-8333-333333333333';
const FID = '44444444-4444-4444-8444-444444444444';
const GID = '55555555-5555-4555-8555-555555555555';
const kickoff = new Date(Date.now() + 26 * 3600_000).toISOString();
const session = { id: SID, group_id: GID, host_id: ME, name: 'Wednesday Football', starts_at: kickoff, duration_minutes: 60, venue: 'Powerleague Shoreditch', location: 'London E1', format_size: 5, max_attendance: 10, visibility: 'group', description: 'Bring both bibs.', payment_mode: 'upfront', price_pence: 600, currency: 'gbp', mode: 'single', motm_mode: 'session', status: 'scheduled', rsvp_deadline: null, voting_closes_at: null, template_id: null, host_confirmed_at: null };
const team = (side, ids) => ({ id: `t${side}`, fixture_id: FID, side, name: side === 'A' ? 'Bibs' : 'Non-bibs', colour: side === 'A' ? '#22C55E' : '#F5F5F5', score: null,
  players: ids.map((uid, i) => ({ fixture_team_id: `t${side}`, fixture_id: FID, user_id: uid, position: 'ANY', is_goalkeeper: i === 0, is_substitute: false, sort_order: i })) });
const fixtures = [{ id: FID, session_id: SID, number: 1, played: false, lineup_confirmed_at: kickoff, teams: [team('A', people.slice(0, 5).map((p) => p.id)), team('B', people.slice(5, 9).map((p) => p.id))] }];
const attendance = people.map((p, i) => ({ session_id: SID, user_id: p.id, status: 'confirmed', waitlisted_at: null, checked_in_at: i < 3 ? kickoff : null, verification: 'unverified', late_arrival: false, replacement_for: null, profile: p }));
const lb = people.slice(0, 8).map((p, i) => ({ rank: i + 1, user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, value: 24 - i * 3, appearances: 12 - i, is_me: p.id === ME, total: 8 }));
const home = {
  profile: { ...people[0], onboarded: true }, unread_notifications: 3,
  next_session: { ...session, my_status: 'confirmed', confirmed: 9, lineup_ready: true, is_host: true },
  tasks: [{ kind: 'vote', session_id: SID, title: 'Tuesday 6-a-side', subtitle: 'Vote for MOTM and rate players', due_at: new Date(Date.now() + 5 * 3600_000).toISOString(), count: 1 },
          { kind: 'payment', session_id: SID, title: 'Sunday League Prep', subtitle: '£5 due', due_at: null, count: 1 }],
  recent_results: [{ session_id: SID, name: 'Tuesday 6-a-side', played_at: new Date(Date.now() - 86400_000).toISOString(), wins: 2, draws: 1, losses: 1, goals: 3, rating_avg: 7.8, rating_eligible: true, motm: true }],
  career: { sessions: 42, goals: 61, motm: 9, rating: 7.24 },
  achievements: [{ code: 'hat_trick', name: 'Hat-trick Hero', icon: 'flame' }, { code: 'first_motm', name: 'First MOTM', icon: 'star' }],
  groups: [{ id: GID, name: 'Wednesday Football', logo_url: null, my_rank: 2, leader: { display_name: 'Alex Reid', value: 7.6 } }],
};
const table = {
  profiles: [{ ...people[0], onboarded: true, bio: 'Left foot only.', created_at: '2026-01-01T00:00:00Z' }],
  sessions: [session], session_attendance: attendance, session_invitations: [], fixtures, session_hosts: [], goal_submissions: [], player_goals: [],
  motm_awards: [], session_player_statistics: [], groups: [{ id: GID, name: 'Wednesday Football', logo_url: null }], notifications: [], activity_feed: [],
  group_members: [{ role: 'owner', group: { id: GID, name: 'Wednesday Football', logo_url: null, location: 'Hackney', group_members: [{ count: 14 }] } }],
  achievements: [], friendships: [], friend_requests: [], user_blocks: [], session_templates: [], user_preferences: [{ user_id: ME, profile_visibility: 'public', show_stats: true, push_enabled: true, email_enabled: true, notification_prefs: {}, theme: 'dark' }],
};
const rpcs = {
  get_home_dashboard: home, get_pending_tasks: home.tasks, is_session_manager: true,
  get_session_payment_statuses: people.slice(1, 9).map((p, i) => ({ user_id: p.id, status: ['paid', 'authorised', 'unpaid', 'paid', 'failed', 'paid', 'pending', 'paid'][i], method: 'card' })),
  get_player_strengths: people.slice(0, 9).map((p, i) => ({ user_id: p.id, position: p.position, group_rating: 6 + (i % 4) * 0.5, career_rating: 6.5, form: 7, games: 10, gk_games: i === 0 ? 5 : 0 })),
  get_recent_pairings: [], get_leaderboard: lb,
  get_player_profile: { profile: table.profiles[0], can_view_stats: true, is_self: true, is_friend: false, friend_request: null, friends_count: 18,
    stats: { sessions: 42, fixtures: 96, wins: 51, draws: 12, losses: 33, goals: 61, assists: 22, motm: 9, rating: 7.2, rated_sessions: 38, highest_rating: 9.1, win_pct: 53.1, current_win_streak: 2, best_win_streak: 7, current_unbeaten: 4, best_unbeaten: 11 },
    form: [7.1, 6.8, 8.2, 7.4, 7.9].map((r, i) => ({ session_id: `s${i}`, rating: r, played_at: new Date(Date.now() - (5 - i) * 7 * 86400_000).toISOString() })),
    rating_history: [6.2, 6.8, 7.0, 6.5, 7.4, 7.1, 6.8, 8.2, 7.4, 7.9].map((r, i) => ({ session_id: `h${i}`, rating: r, played_at: new Date(Date.now() - (10 - i) * 7 * 86400_000).toISOString() })),
    recent_results: home.recent_results, achievements: [{ code: 'first_match', name: 'First Match', icon: 'shirt', description: '', unlocked_at: '2026-01-07T00:00:00Z' }, { code: 'hat_trick', name: 'Hat-trick Hero', icon: 'flame', description: '', unlocked_at: '2026-03-01T00:00:00Z' }],
    groups: [{ id: GID, name: 'Wednesday Football', logo_url: null, role: 'owner' }], teammates: people.slice(1, 4).map((p, i) => ({ user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: null, games: 30 - i * 6, wins: 16 - i * 3 })) },
};

const browser = await chromium.launch();
const failures = [];
for (const [vpName, vp] of Object.entries({ phone: { width: 375, height: 812 }, desktop: { width: 1366, height: 900 } })) {
  const page = await browser.newPage({ viewport: vp });
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
    if (m && m[1]) body = rpcs[m[2]] ?? null;
    else if (m) body = table[m[2]] ?? [];
    if (single && Array.isArray(body)) body = body[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const [name, path, expected] of [
    ['home', '/', 'Next up'], ['session', `/session/${SID}`, 'Host controls'], ['lineup', `/session/${SID}/lineup`, 'Balance teams'],
    ['leagues', '/leagues', 'My groups'], ['profile', '/profile', 'Achievements'], ['create', '/create', 'New session'],
  ]) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (name === 'leagues') { await page.getByText('Leaderboards').first().click(); await page.waitForTimeout(500); }
    const text = await page.locator('body').innerText();
    if (!text.toLowerCase().includes(expected.toLowerCase())) failures.push(`${vpName} ${path}: expected "${expected}"`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollW > vp.width + 1) failures.push(`${vpName} ${path}: horizontal overflow (${scrollW}px)`);
    await page.screenshot({ path: join(OUT, `auth-${vpName}-${name}.png`), fullPage: vpName === 'phone' });
  }
  if (errors.length) failures.push(`${vpName}: runtime errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.error('Visual check FAILED:\n' + failures.join('\n')); process.exit(1); }
console.log(`Visual check passed. Screenshots in ${OUT}`);
