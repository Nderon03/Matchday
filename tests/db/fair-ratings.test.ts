/** Fair ratings: outliers, generous/harsh raters and favouritism don't skew a player's match rating. */
import { Db, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

// a game with `n` verified players; returns their ids (index 0 is the host)
async function game(players: string[] | number) {
  const ids = typeof players === 'number' ? await Promise.all(Array.from({ length: players }, () => db.createUser(uniq('fr')))) : players;
  const sid = await db.rpc<string>(ids[0], 'create_session', { p: { name: 'Fair FC', starts_at: new Date(Date.now() + 3600_000).toISOString(), format_size: 5, max_attendance: 20 } });
  for (const u of ids) {
    await db.admin(`insert into session_attendance (session_id, user_id, status, verification) values ($1, $2, 'confirmed', 'verified')
      on conflict (session_id, user_id) do update set status = 'confirmed', verification = 'verified'`, [sid, u]);
  }
  return { sid, ids };
}
const rate = (sid: string, rater: string, ratee: string, score: number) =>
  db.admin(`insert into player_ratings (session_id, rater_id, ratee_id, score) values ($1, $2, $3, $4)`, [sid, rater, ratee, score]);
const fair = async (sid: string, u: string) => (await db.admin(`select avg_score::float a, n from public.fair_rating($1, $2)`, [sid, u]))[0];

describe('fair ratings', () => {
  it('a normal night is a plain average', async () => {
    const { sid, ids } = await game(4);
    await rate(sid, ids[1], ids[0], 7); await rate(sid, ids[2], ids[0], 8); await rate(sid, ids[3], ids[0], 9);
    expect(await fair(sid, ids[0])).toEqual({ a: 8, n: 3 });
  });

  it('an extreme outlier (a spiteful 1) is left out, but still counts towards eligibility', async () => {
    const { sid, ids } = await game(6);
    for (const [i, s] of [[1, 7], [2, 7], [3, 8], [4, 7], [5, 1]] as const) await rate(sid, ids[i], ids[0], s);
    expect(await fair(sid, ids[0])).toEqual({ a: 7.25, n: 5 });
  });

  it('someone who rates everyone 10 is pulled halfway back to the night', async () => {
    const { sid, ids } = await game(5);
    // a normal night around 6; one generous rater gives 10s to everyone
    for (const ratee of [1, 2, 3]) for (const rater of [0, 4]) if (rater !== ratee) await rate(sid, ids[rater], ids[ratee], 6);
    for (const ratee of [0, 2, 3]) await rate(sid, ids[1], ids[ratee], 10);
    const r = await fair(sid, ids[2]);
    expect(r.n).toBe(3);
    expect(r.a).toBeLessThan(7.33); // the plain average would be 7.33
    expect(r.a).toBeGreaterThan(6);
  });

  it('favouritism: a rater who always rates their mate far above everyone else counts half', async () => {
    const people = await Promise.all(Array.from({ length: 4 }, () => db.createUser(uniq('fav'))));
    const [star, mate, x, y] = people;
    for (let i = 0; i < 3; i++) {
      const { sid } = await game(people);
      await db.admin(`update sessions set status = 'finalised' where id = $1`, [sid]);
      await rate(sid, mate, star, 10); await rate(sid, x, star, 6); await rate(sid, y, star, 6);
    }
    const { sid } = await game(people);
    await rate(sid, mate, star, 10); await rate(sid, x, star, 6); await rate(sid, y, star, 6);
    // plain average 7.33; with the mate's 10 at half weight: (10*0.5 + 6 + 6) / 2.5 = 6.8
    expect(await fair(sid, star)).toEqual({ a: 6.8, n: 3 });
  });

  it('the match rating uses it when a game is finalised', async () => {
    const { sid, ids } = await game(6);
    for (const [i, s] of [[1, 7], [2, 7], [3, 8], [4, 7], [5, 1]] as const) await rate(sid, ids[i], ids[0], s);
    await db.admin(`update sessions set status = 'finalised' where id = $1`, [sid]);
    await db.admin(`select public.compute_session_statistics($1)`, [sid]);
    const [st] = await db.admin(`select rating_avg::float r, rating_count from session_player_statistics where session_id = $1 and user_id = $2`, [sid, ids[0]]);
    expect(st).toEqual({ r: 7.25, rating_count: 5 });
  });
});
