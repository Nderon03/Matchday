/** Celebration moments are remembered per account, so they don't replay on another device. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

const mine = (u: string) => db.as<{ key: string; value: string }>(u, `select key, value from seen_moments order by key`);

describe('seen moments', () => {
  it('records markers for the signed-in user, and a value only moves forward', async () => {
    const u = await db.createUser(uniq('sm'));
    await db.rpc(u, 'mark_moments_seen', { p: { friends: '2026-11-20T10:00:00.000Z', 'reveal:abc': '1' } });
    expect(await mine(u)).toEqual([{ key: 'friends', value: '2026-11-20T10:00:00.000Z' }, { key: 'reveal:abc', value: '1' }]);
    // an older device reporting an earlier time can't make you see things again
    await db.rpc(u, 'mark_moments_seen', { p: { friends: '2026-11-01T10:00:00.000Z' } });
    expect((await mine(u))[0].value).toBe('2026-11-20T10:00:00.000Z');
    await db.rpc(u, 'mark_moments_seen', { p: { friends: '2026-11-25T08:00:00.000Z' } });
    expect((await mine(u))[0].value).toBe('2026-11-25T08:00:00.000Z');
  });

  it('is private: nobody else can read or write your markers', async () => {
    const [a, b] = [await db.createUser(uniq('sa')), await db.createUser(uniq('sb'))];
    await db.rpc(a, 'mark_moments_seen', { p: { friends: '2026-11-20T10:00:00.000Z' } });
    expect(await mine(b)).toEqual([]);
    await expect(db.as(b, `insert into seen_moments (user_id, key, value) values ($1, 'x', '1')`, [a])).rejects.toThrow(/permission denied/);
    await expect(db.as(b, `update seen_moments set value = '1' where user_id = $1`, [a])).rejects.toThrow(/permission denied/);
    await expect(db.rpc(null, 'mark_moments_seen', { p: { x: '1' } })).rejects.toThrow(/permission denied/);
  });

  it('ignores junk: empty values, long keys, and more than 100 at once', async () => {
    const u = await db.createUser(uniq('sj'));
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`reveal:${i}`, '1']));
    await db.rpc(u, 'mark_moments_seen', { p: { ...many, empty: '', ['k'.repeat(200)]: '1' } });
    const rows = await mine(u);
    expect(rows.length).toBeGreaterThan(90);
    expect(rows.length).toBeLessThanOrEqual(100); // at most 100 per call
    expect(rows.some((r) => r.key === 'empty' || r.key.length > 120)).toBe(false);
    await db.rpc(u, 'mark_moments_seen', { p: null });
    await db.rpc(u, 'mark_moments_seen', { p: 42 }); // not an object: ignored
  });
});
