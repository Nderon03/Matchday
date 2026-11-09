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

describe('postcodes and distance', () => {
  it('every session needs a valid UK postcode', async () => {
    const host = await db.createUser(uniq('ph'));
    const base = { name: 'Postcode FC', starts_at: new Date(Date.now() + 86400_000).toISOString(), format_size: 5 };
    await expect(db.rpc(host, 'create_session', { p: { ...base, postcode: '' } })).rejects.toThrow(/postcode/i);
    await expect(db.rpc(host, 'create_session', { p: { ...base, postcode: 'NOT A CODE', latitude: 51.6, longitude: -0.2 } })).rejects.toThrow(/postcode/i);
    // a location outside the UK is refused
    await expect(db.rpc(host, 'create_session', { p: { ...base, postcode: 'NW7 2EU', latitude: 48.85, longitude: 2.35 } })).rejects.toThrow(/couldn.t find/i);
    // a valid postcode is enough to create the game; the app adds the location when the lookup answers
    const quick = await db.rpc<string>(host, 'create_session', { p: { ...base, postcode: 'NW7 2EU' } });
    await db.rpc(host, 'set_session_location', { p_session: quick, p_postcode: 'nw7 2eu', p_lat: 51.6142, p_lng: -0.2447 });
    expect((await db.admin(`select latitude from sessions where id = $1`, [quick]))[0].latitude).toBeCloseTo(51.6142);
    const id = await db.rpc<string>(host, 'create_session', { p: { ...base, postcode: 'nw72eu', latitude: 51.6142, longitude: -0.2447 } });
    expect((await db.admin(`select postcode from sessions where id = $1`, [id]))[0].postcode).toBe('NW7 2EU');
    // editing can't remove it; repeating copies it
    await expect(db.rpc(host, 'update_session', { p_session: id, p: { postcode: '' } })).rejects.toThrow(/postcode/i);
    const copy = await db.rpc<string>(host, 'duplicate_session', { p_session: id, p_starts_at: new Date(Date.now() + 8 * 86400_000).toISOString() });
    expect((await db.admin(`select postcode, latitude from sessions where id = $1`, [copy]))[0]).toEqual({ postcode: 'NW7 2EU', latitude: 51.6142 });
  });

  it('finds public games within a radius and reports the distance', async () => {
    const host = await db.createUser(uniq('rh'));
    const me = await db.createUser(uniq('rm'));
    const tag = uniq('Rx');
    const when = new Date(Date.now() + 86400_000).toISOString();
    const millHill = await db.rpc<string>(host, 'create_session', { p: { name: `Mill Hill ${tag}`, starts_at: when, visibility: 'public', venue: 'Powerleague Mill Hill', postcode: 'NW7 2EU', latitude: 51.6142, longitude: -0.2447 } });
    const brighton = await db.rpc<string>(host, 'create_session', { p: { name: `Brighton ${tag}`, starts_at: when, visibility: 'public', postcode: 'BN1 1AA', latitude: 50.8225, longitude: -0.1372 } });
    // searching from Edgware (~2 miles from Mill Hill), 5-mile radius
    const near = await db.as(me, `select id, round(distance_miles::numeric, 1) as mi from public.search_public_sessions($1, null, null, null, false, 40, 51.6136, -0.2750, 5)`, [tag]);
    expect(near.map((r) => r.id)).toEqual([millHill]);
    expect(Number(near[0].mi)).toBeGreaterThan(1);
    expect(Number(near[0].mi)).toBeLessThan(3);
    const wide = await db.as(me, `select id from public.search_public_sessions($1, null, null, null, false, 40, 51.6136, -0.2750, 100)`, [tag]);
    expect(wide.map((r) => r.id).sort()).toEqual([millHill, brighton].sort());
  });
});
