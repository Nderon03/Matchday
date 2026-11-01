import { Client } from 'pg';
import { randomUUID } from 'crypto';

const url = process.env.MATCHDAY_TEST_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/matchday_test';

export class Db {
  client = new Client({ connectionString: url });
  async connect() {
    await this.client.connect();
  }
  async end() {
    await this.client.end();
  }
  /** Run SQL as the database owner (bypasses RLS) — used for setup and assertions. */
  async admin<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.client.query(sql, params);
    return r.rows as T[];
  }
  /** Run SQL as an authenticated end user, exactly as PostgREST would. */
  async as<T = any>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await this.client.query('begin');
    try {
      await this.client.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
      await this.client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
      ]);
      const r = await this.client.query(sql, params);
      await this.client.query('commit');
      return r.rows as T[];
    } catch (e) {
      await this.client.query('rollback');
      throw e;
    }
  }
  async rpc<T = any>(userId: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`;
    const rows = await this.as(userId, sql, keys.map((k) => normalise(args[k])));
    return rows[0]?.result as T;
  }
  async createUser(username: string): Promise<string> {
    const id = randomUUID();
    await this.admin(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`, [
      id,
      `${username}-${id.slice(0, 6)}@example.com`,
      JSON.stringify({ username, display_name: username[0].toUpperCase() + username.slice(1) }),
    ]);
    return id;
  }
  async befriend(a: string, b: string) {
    await this.rpc(a, 'send_friend_request', { p_target: b });
    const [req] = await this.admin(`select id from friend_requests where sender_id = $1 and receiver_id = $2 and status = 'pending'`, [a, b]);
    await this.rpc(b, 'respond_friend_request', { p_request: req.id, p_accept: true });
  }
}

function normalise(v: unknown) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) return JSON.stringify(v);
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') return JSON.stringify(v);
  return v;
}

export const uniq = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

export async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ hint: code });
}
