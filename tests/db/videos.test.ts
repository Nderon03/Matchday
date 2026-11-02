/** Match videos: YouTube-only links, managers only, after kick-off, max 5, squad notified. */
import { Db, uniq, expectAppError } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

async function setup(startsInMinutes: number) {
  const host = await db.createUser(uniq('vh'));
  const p = await db.createUser(uniq('vp'));
  const outsider = await db.createUser(uniq('vo'));
  await db.befriend(host, p);
  const sid = await db.rpc<string>(host, 'create_session', {
    p: { name: 'Video FC', starts_at: new Date(Date.now() + startsInMinutes * 60_000).toISOString(), format_size: 5, invitee_ids: [p] },
  });
  await db.rpc(p, 'respond_to_session', { p_session: sid, p_response: 'confirmed' });
  return { host, p, outsider, sid };
}

describe('session videos', () => {
  it('parses only YouTube links in the database', async () => {
    const rows = await db.admin(`select public.youtube_video_id($1) a, public.youtube_video_id($2) b, public.youtube_video_id($3) c, public.youtube_video_id($4) d`, [
      'https://youtu.be/dQw4w9WgXcQ?si=x', 'https://www.youtube.com/watch?t=3&v=dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/aB3_d-Ef9Gh',
    ]);
    expect(rows[0]).toEqual({ a: 'dQw4w9WgXcQ', b: 'dQw4w9WgXcQ', c: null, d: 'aB3_d-Ef9Gh' });
  });

  it('host adds a video after kick-off; players see it and are notified', async () => {
    const { host, p, outsider, sid } = await setup(-30);
    await expectAppError(db.rpc(p, 'add_session_video', { p_session: sid, p_url: 'https://youtu.be/dQw4w9WgXcQ' }), 'forbidden');
    await expectAppError(db.rpc(host, 'add_session_video', { p_session: sid, p_url: 'https://vimeo.com/1234' }), 'invalid_video');
    const id = await db.rpc<string>(host, 'add_session_video', { p_session: sid, p_url: 'https://youtu.be/dQw4w9WgXcQ', p_title: 'Game 1' });
    await expectAppError(db.rpc(host, 'add_session_video', { p_session: sid, p_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }), 'duplicate');
    expect(await db.as(p, `select video_id, title from session_videos where session_id = $1`, [sid])).toEqual([{ video_id: 'dQw4w9WgXcQ', title: 'Game 1' }]);
    expect(await db.as(outsider, `select id from session_videos where session_id = $1`, [sid])).toHaveLength(0);
    const notes = await db.admin(`select user_id from notifications where type = 'session_video' and data->>'session_id' = $1`, [sid]);
    expect(notes.map((n) => n.user_id)).toEqual([p]);
    await expect(db.as(host, `insert into session_videos (session_id, video_id) values ($1, 'aaaaaaaaaaa')`, [sid])).rejects.toThrow();
    await db.rpc(host, 'remove_session_video', { p_video: id });
    expect(await db.admin(`select id from session_videos where session_id = $1`, [sid])).toHaveLength(0);
  });

  it('not before kick-off, and at most five', async () => {
    const early = await setup(24 * 60);
    await expectAppError(db.rpc(early.host, 'add_session_video', { p_session: early.sid, p_url: 'https://youtu.be/dQw4w9WgXcQ' }), 'not_started');
    const { host, sid } = await setup(-10);
    for (const id of ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4', 'aaaaaaaaaa5']) {
      await db.rpc(host, 'add_session_video', { p_session: sid, p_url: `https://youtu.be/${id}` });
    }
    await expectAppError(db.rpc(host, 'add_session_video', { p_session: sid, p_url: 'https://youtu.be/aaaaaaaaaa6' }), 'video_limit');
  });
});
