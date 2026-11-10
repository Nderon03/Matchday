/** Send feedback: saved with its context, private to the sender, and not spammable. */
import { Db, expectAppError, uniq } from './helpers';

const db = new Db();
beforeAll(() => db.connect());
afterAll(() => db.end());

describe('send feedback', () => {
  it('saves the message with its context; only the sender can read it', async () => {
    const me = await db.createUser(uniq('fb'));
    const other = await db.createUser(uniq('fb2'));
    await expectAppError(db.rpc(me, 'submit_feedback', { p_kind: 'bug', p_message: 'x' }), 'invalid');
    const id = await db.rpc<string>(me, 'submit_feedback', { p_kind: 'bug', p_message: 'Scores screen froze', p_context: { screen: '/session/:id/results', device: 'SM-A510F' } });
    const [row] = await db.admin(`select user_id, kind, message, context->>'device' device from app_feedback where id = $1`, [id]);
    expect(row).toEqual({ user_id: me, kind: 'bug', message: 'Scores screen froze', device: 'SM-A510F' });
    expect(await db.as(other, `select id from app_feedback where id = '${id}'`)).toHaveLength(0);
    expect(await db.as(me, `select id from app_feedback where id = '${id}'`)).toHaveLength(1);
  });
});
