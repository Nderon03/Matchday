/** "Find a game": only upcoming public sessions, with text and format filters; blocked hosts hidden. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

const create = (host: string, p: Record<string, unknown>) =>
  db.rpc<string>(host, 'create_session', { p: { format_size: 5, starts_at: new Date(Date.now() + 86400_000).toISOString(), ...p } });

it('finds public upcoming games by venue/area and filters', async () => {
  const host = await db.createUser(uniq('fh'));
  const me = await db.createUser(uniq('fm'));
  const tag = uniq('Zx');
  const pub = await create(host, { name: `Tuesday ${tag}`, visibility: 'public', venue: 'Hackney Marshes', location: 'Hackney' });
  await create(host, { name: `Private ${tag}`, visibility: 'private', venue: 'Hackney Marshes' });
  const seven = await create(host, { name: `Sevens ${tag}`, visibility: 'public', format_size: 7, location: 'Camden', payment_mode: 'after', price_pence: 500 });

  const byName = await db.as(me, `select id, confirmed, host_name from public.search_public_sessions($1)`, [tag]);
  expect(byName.map((r) => r.id).sort()).toEqual([pub, seven].sort());
  expect(byName.find((r) => r.id === pub)?.confirmed).toBe(1); // the host is in

  const hackney = await db.as(me, `select id from public.search_public_sessions('hackney') where id in ($1, $2)`, [pub, seven]);
  expect(hackney.map((r) => r.id)).toEqual([pub]);
  // words in any order, across name, venue and area
  const words = await db.as(me, `select id from public.search_public_sessions($1)`, [`marshes ${tag.toLowerCase()} HACKNEY`]);
  expect(words.map((r) => r.id)).toEqual([pub]);
  expect(await db.as(me, `select id from public.search_public_sessions($1)`, [`${tag} wembley`])).toHaveLength(0);
  const sevens = await db.as(me, `select id from public.search_public_sessions($1, null, null, 7)`, [tag]);
  expect(sevens.map((r) => r.id)).toEqual([seven]);
  const free = await db.as(me, `select id from public.search_public_sessions($1, null, null, null, true)`, [tag]);
  expect(free.map((r) => r.id)).toEqual([pub]);

  // anyone can join a public game they found
  expect(await db.rpc(me, 'respond_to_session', { p_session: pub, p_response: 'confirmed' })).toBe('confirmed');
  const mine = await db.as(me, `select my_status from public.search_public_sessions($1) where id = $2`, [tag, pub]);
  expect(mine[0].my_status).toBe('confirmed');

  // blocked hosts disappear
  await db.rpc(me, 'block_user', { p_user: host });
  expect(await db.as(me, `select id from public.search_public_sessions($1)`, [tag])).toHaveLength(0);
  // signed-out visitors see nothing
  expect(await db.as(null, `select id from public.search_public_sessions($1)`, [tag])).toHaveLength(0);
});

it('discovers public groups by words in any order', async () => {
  const owner = await db.createUser(uniq('go'));
  const me = await db.createUser(uniq('gm'));
  const tag = uniq('Gx');
  const g = await db.rpc<string>(owner, 'create_group', { p_name: `Powerleague ${tag}`, p_visibility: 'public', p_join_policy: 'request', p_location: 'Mill Hill' });
  await db.rpc<string>(owner, 'create_group', { p_name: `Secret ${tag}`, p_visibility: 'private', p_join_policy: 'request', p_location: 'Mill Hill' });
  const found = await db.as(me, `select id, members from public.search_public_groups($1)`, [`mill hill ${tag}`]);
  expect(found).toEqual([{ id: g, members: 1 }]);
  expect(await db.as(me, `select id from public.search_public_groups($1)`, [`${tag} powerleague`])).toHaveLength(1);
});
