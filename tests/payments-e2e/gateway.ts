/**
 * A small stand-in for the Supabase API (PostgREST + the auth "who am I" endpoint), backed by the
 * local test database. It covers exactly what the payment functions use through supabase-js:
 * select (with filters, embedded parents, counts, single rows), insert, upsert, update and RPC calls,
 * run either as the service role (no row security) or as a signed-in user (row security applies).
 * Test-only: lets the real Edge Function code run end to end without a hosted Supabase project.
 */
import pg from 'npm:pg@8';

const DB_URL = Deno.env.get('MATCHDAY_TEST_DB_URL') ?? 'postgresql://postgres:postgres@localhost:5432/matchday_test';
export const pool = new pg.Pool({ connectionString: DB_URL, max: 6 });

/** Fake JWTs: only the payload matters here (the real API checks signatures; this harness trusts itself). */
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export const jwtFor = (claims: Record<string, unknown>) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
const claimsOf = (auth: string | null): Record<string, any> => {
  const token = auth?.replace(/^Bearer\s+/i, '') ?? '';
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
};

/** Tests can make the next write to a table fail once (to rehearse Stripe retrying after an error). */
export const faults = { failNextWrite: null as string | null };

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

function splitTop(s: string) {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

type Item = { kind: 'all' } | { kind: 'col'; name: string; as: string } | { kind: 'embed'; table: string; as: string; sub: Item[] };
function parseSelect(s: string): Item[] {
  return splitTop(s || '*').map((raw) => {
    if (raw === '*') return { kind: 'all' } as Item;
    const m = raw.match(/^(?:([a-z_]+):)?([a-z_]+)(?:\((.*)\))?$/s);
    if (!m) throw new Error(`unsupported select ${raw}`);
    const [, alias, name, sub] = m;
    if (sub !== undefined) return { kind: 'embed', table: name, as: alias ?? name, sub: parseSelect(sub) } as Item;
    return { kind: 'col', name, as: alias ?? name } as Item;
  });
}

async function project(client: pg.PoolClient, row: Record<string, any>, items: Item[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const it of items) {
    if (it.kind === 'all') Object.assign(out, row);
    else if (it.kind === 'col') out[it.as] = row[it.name];
    else {
      // a parent row through its foreign key: session:sessions(...) reads row.session_id
      const fk = `${it.as === it.table ? it.table.replace(/s$/, '') : it.as}_id`;
      const id = row[fk];
      if (id == null) { out[it.as] = null; continue; }
      const r = await client.query(`select to_jsonb(x) as r from public.${ident(it.table)} x where id = $1`, [id]);
      out[it.as] = r.rows[0] ? await project(client, r.rows[0].r, it.sub) : null;
    }
  }
  return out;
}

function where(params: URLSearchParams, alias: string, values: unknown[]) {
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  const parts: string[] = [];
  for (const [key, raw] of params) {
    if (reserved.has(key)) continue;
    const col = `${alias}.${ident(key)}`;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot); const v = raw.slice(dot + 1);
    if (op === 'is') { parts.push(`${col} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : 'false'}`); continue; }
    if (op === 'in') {
      values.push(v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')));
      parts.push(`${col}::text = any($${values.length}::text[])`);
      continue;
    }
    const sql = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
    if (!sql) throw new Error(`unsupported filter ${key}=${raw}`);
    values.push(v);
    parts.push(`${col} ${sql} $${values.length}`);
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

const pgError = (e: any) => ({ code: e.code ?? 'PGRST000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });

async function asCaller<T>(claims: Record<string, any>, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (claims.role === 'authenticated') await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const r = await fn(client);
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function handle(req: Request): Promise<Response> {
  if (Deno.env.get('GW_DEBUG')) {
    const res = await handleInner(req.clone());
    console.log('GW', req.method, decodeURIComponent(new URL(req.url).pathname + new URL(req.url).search), res.status);
    return res;
  }
  return handleInner(req);
}

async function handleInner(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const claims = claimsOf(req.headers.get('authorization'));
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  if (url.pathname === '/auth/v1/user') {
    if (!claims.sub) return reply(401, { message: 'invalid JWT' });
    return reply(200, { id: claims.sub, email: claims.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
  }
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/);
  if (!m) return reply(404, { message: `no route ${url.pathname}` });
  const [, isRpc, name] = m;
  const prefer = req.headers.get('prefer') ?? '';
  const wantsObject = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const one = (rows: unknown[]) => wantsObject
    ? rows.length === 1 ? reply(200, rows[0]) : reply(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${rows.length} rows`, hint: null })
    : reply(200, rows);

  try {
    if (isRpc) {
      const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await req.json().catch(() => ({}));
      const keys = Object.keys(args);
      const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      const r: pg.QueryResult = await asCaller(claims, (c: pg.PoolClient) => c.query(`select public.${ident(name)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) as r`, values));
      const v = r.rows[0]?.r;
      return reply(200, v === '' ? null : v ?? null);
    }

    const table = `public.${ident(name)}`;
    const items = parseSelect(url.searchParams.get('select') ?? '*');
    const values: unknown[] = [];

    if (req.method === 'GET' || req.method === 'HEAD') {
      const order = url.searchParams.get('order');
      const orderSql = order ? `order by ${order.split(',').map((o) => { const [c, d] = o.split('.'); return `t.${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ')}` : '';
      const limit = url.searchParams.get('limit');
      const sql = `select to_jsonb(t) as r from ${table} t ${where(url.searchParams, 't', values)} ${orderSql} ${limit ? `limit ${Number(limit)}` : ''}`;
      const rows = await asCaller(claims, async (c) => {
        const r = await c.query(sql, values);
        return Promise.all(r.rows.map((x: any) => project(c, x.r, items)));
      });
      const headers: Record<string, string> = prefer.includes('count=exact') ? { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' } : {};
      if (req.method === 'HEAD') return new Response(null, { status: 200, headers });
      if (wantsObject) return one(rows);
      return reply(200, rows, headers);
    }

    if (faults.failNextWrite === name) {
      faults.failNextWrite = null;
      return reply(503, { code: '57P01', message: 'simulated database outage', details: null, hint: null });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const rowsIn = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get('on_conflict');
      const rows = await asCaller(claims, async (c) => {
        const out = [];
        for (const row of rowsIn) {
          const cols = Object.keys(row).map(ident);
          let onConflict = '';
          if (prefer.includes('resolution=ignore-duplicates')) onConflict = `on conflict ${conflict ? `(${conflict.split(',').map(ident).join(', ')})` : ''} do nothing`;
          else if (prefer.includes('resolution=merge-duplicates')) {
            onConflict = `on conflict (${(conflict ?? 'id').split(',').map(ident).join(', ')}) do update set ${cols.map((col) => `${col} = excluded.${col}`).join(', ')}`;
          }
          const r = await c.query(
            `insert into ${table} as t (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_record(null::${table}, $1) ${onConflict} returning to_jsonb(t) as r`,
            [JSON.stringify(row)],
          );
          for (const x of r.rows) out.push(await project(c, x.r, items));
        }
        return out;
      });
      if (!prefer.includes('return=representation')) return new Response(null, { status: 201 });
      return wantsObject ? one(rows) : reply(201, rows);
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      const cols = Object.keys(body).map(ident);
      values.push(JSON.stringify(body));
      const sql = `update ${table} as t set ${cols.map((col) => `${col} = r.${col}`).join(', ')} from jsonb_populate_record(null::${table}, $1) r ${where(url.searchParams, 't', values)} returning to_jsonb(t) as r`;
      const rows = await asCaller(claims, async (c) => {
        const r = await c.query(sql, values);
        return Promise.all(r.rows.map((x: any) => project(c, x.r, items)));
      });
      if (!prefer.includes('return=representation')) return new Response(null, { status: 204 });
      return wantsObject ? one(rows) : reply(200, rows);
    }
    return reply(405, { message: 'method not supported' });
  } catch (e) {
    const err = pgError(e);
    return reply(err.code === '23505' ? 409 : 400, err);
  }
}
