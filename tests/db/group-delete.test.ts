/** Owners can delete a group, whatever it has in it (games, seasons, badges, fines...). */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

it('an owner deletes a group with finished and upcoming group games', async () => {
  const host = await db.createUser(uniq('gd'));
  const p = await db.createUser(uniq('gdp'));
  const groupId = await db.rpc<string>(host, 'create_group', { p_name: 'Delete FC', p_join_policy: 'open', p_visibility: 'private' });
  await db.admin(`insert into group_members (group_id, user_id) values ($1, $2)`, [groupId, p]);
  const mk = () => db.rpc<string>(host, 'create_session', { p: { name: 'Delete FC', group_id: groupId, visibility: 'group', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5 } });
  const done = await mk();
  await db.admin(`update sessions set status = 'completed' where id = $1`, [done]);
  await db.admin(`update sessions set status = 'finalised', finalised_at = now() where id = $1`, [done]);
  await mk(); // an upcoming one too
  const r = await db.as(host, `delete from groups where id = $1 returning id`, [groupId]).catch((e: Error) => e);
  if (r instanceof Error) throw r;
  expect((await db.admin(`select count(*)::int n from groups where id = $1`, [groupId]))[0].n).toBe(0);
});

describe('host hand-over', () => {
  async function gameWith(payment: 'free' | 'after') {
    const host = await db.createUser(uniq('hh'));
    const early = await db.createUser(uniq('hhe'));
    const later = await db.createUser(uniq('hhl'));
    await db.befriend(host, early); await db.befriend(host, later);
    const sid = await db.rpc<string>(host, 'create_session', {
      p: { name: 'Handover FC', starts_at: new Date(Date.now() + 48 * 3600_000).toISOString(), format_size: 5, max_attendance: 10, visibility: 'private',
        invitee_ids: [early, later], payment_mode: payment, price_pence: payment === 'free' ? 0 : 500 },
    });
    await db.rpc(early, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    await db.admin(`update session_attendance set responded_at = now() - interval '1 hour' where session_id = $1 and user_id = $2`, [sid, early]);
    await db.rpc(later, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
    return { host, early, later, sid };
  }

  it('free game: the first player in becomes the host, and everyone hears', async () => {
    const { host, early, later, sid } = await gameWith('free');
    const [a] = await db.admin(`select status from session_attendance where session_id = $1 and user_id = $2`, [sid, host]);
    expect(a.status).toBe('confirmed');
    await db.rpc(host, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' });
    const [s] = await db.admin(`select host_id from sessions where id = $1`, [sid]);
    expect(s.host_id).toBe(early);
    const n = await db.admin(`select user_id, title from notifications where type = 'host_handover' and data->>'session_id' = $1 order by title`, [sid]);
    expect(n.map((x) => x.user_id).sort()).toEqual([early, later].sort());
  });

  it('paid game: they co-host and run it; payments stay with the original host', async () => {
    const { host, early, sid } = await gameWith('after');
    await db.rpc(host, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' });
    const [s] = await db.admin(`select host_id, (select count(*)::int from session_hosts where session_id = $1 and user_id = $2) cohost from sessions where id = $1`, [sid, early]);
    expect(s).toEqual({ host_id: host, cohost: 1 });
    expect((await db.admin(`select public.is_session_manager($1, $2) m`, [sid, early]))[0].m).toBe(true);
  });

  it('nobody else is in: nothing changes', async () => {
    const host = await db.createUser(uniq('hhn'));
    const sid = await db.rpc<string>(host, 'create_session', { p: { name: 'Solo', starts_at: new Date(Date.now() + 48 * 3600_000).toISOString(), format_size: 5 } });
    await db.rpc(host, 'respond_to_session', { p_session: sid, p_response: 'withdrawn' });
    expect((await db.admin(`select host_id from sessions where id = $1`, [sid]))[0].host_id).toBe(host);
  });
});
