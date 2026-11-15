/**
 * A tiny form validator with the small slice of the zod API the app uses (string/number/date/enum/
 * object rules, safeParse, issues with paths). zod was ~800 KB of code in the app for this; this is
 * a few KB and behaves the same for our forms.
 */
export interface Issue { path: (string | number)[]; message: string }
export interface SchemaError { issues: Issue[] }
export type SafeParse<T> = { success: true; data: T; error?: undefined } | { success: false; data?: undefined; error: SchemaError };

type Check<T> = (v: T) => string | null;
type Ctx = { addIssue: (i: { code?: string; path?: (string | number)[]; message: string }) => void };

export abstract class Schema<T> {
  protected abstract run(v: unknown, path: (string | number)[], issues: Issue[]): T;
  safeParse(v: unknown): SafeParse<T> {
    const issues: Issue[] = [];
    const data = this.run(v, [], issues);
    return issues.length ? { success: false, error: { issues } } : { success: true, data };
  }
  /** internal: validate as part of a bigger schema */
  _run(v: unknown, path: (string | number)[], issues: Issue[]) { return this.run(v, path, issues); }
  optional(): Schema<T | undefined> { return new Wrap(this, (v) => v === undefined); }
  nullable(): Schema<T | null> { return new Wrap(this, (v) => v === null); }
  or<U>(other: Schema<U>): Schema<T | U> { return new Either(this, other); }
}

class Wrap<T, U> extends Schema<T | U> {
  constructor(private inner: Schema<T>, private skip: (v: unknown) => boolean) { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) { return this.skip(v) ? (v as U) : this.inner._run(v, path, issues); }
}

class Either<T, U> extends Schema<T | U> {
  constructor(private a: Schema<T>, private b: Schema<U>) { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    const first: Issue[] = [];
    const r = this.a._run(v, path, first);
    if (!first.length) return r;
    const second: Issue[] = [];
    const r2 = this.b._run(v, path, second);
    if (!second.length) return r2;
    issues.push(...first);
    return r;
  }
}

const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Str extends Schema<string> {
  private checks: Check<string>[] = [];
  private doTrim = false;
  private add(c: Check<string>) { const s = Object.assign(Object.create(Str.prototype), this, { checks: [...this.checks, c] }); return s as Str; }
  trim() { const s = this.add(() => null); s.doTrim = true; return s; }
  min(n: number, message?: string) { return this.add((v) => (v.length < n ? message ?? `At least ${n} characters` : null)); }
  max(n: number, message?: string) { return this.add((v) => (v.length > n ? message ?? `At most ${n} characters` : null)); }
  regex(re: RegExp, message?: string) { return this.add((v) => (re.test(v) ? null : message ?? 'Invalid format')); }
  email(message?: string) { return this.add((v) => (EMAIL.test(v) ? null : message ?? 'Enter a valid email address')); }
  uuid(message?: string) { return this.add((v) => (UUID.test(v) ? null : message ?? 'Invalid id')); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (typeof v !== 'string') { issues.push({ path, message: 'Required' }); return v as string; }
    const s = this.doTrim ? v.trim() : v;
    for (const c of this.checks) { const m = c(s); if (m) issues.push({ path, message: m }); }
    return s;
  }
}

class Num extends Schema<number> {
  private checks: Check<number>[] = [];
  private add(c: Check<number>) { return Object.assign(Object.create(Num.prototype), this, { checks: [...this.checks, c] }) as Num; }
  int(message?: string) { return this.add((v) => (Number.isInteger(v) ? null : message ?? 'Must be a whole number')); }
  min(n: number, message?: string) { return this.add((v) => (v < n ? message ?? `At least ${n}` : null)); }
  max(n: number, message?: string) { return this.add((v) => (v > n ? message ?? `At most ${n}` : null)); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (typeof v !== 'number' || Number.isNaN(v)) { issues.push({ path, message: 'Enter a number' }); return v as number; }
    for (const c of this.checks) { const m = c(v); if (m) issues.push({ path, message: m }); }
    return v;
  }
}

class DateS extends Schema<Date> {
  constructor(private message = 'Pick a date') { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) issues.push({ path, message: this.message });
    return v as Date;
  }
}

class Enum<T extends string> extends Schema<T> {
  constructor(private values: readonly T[], private message = 'Choose an option') { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (!this.values.includes(v as T)) issues.push({ path, message: this.message });
    return v as T;
  }
}

class Literal<T extends string | number | boolean> extends Schema<T> {
  constructor(private value: T) { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (v !== this.value) issues.push({ path, message: 'Invalid value' });
    return v as T;
  }
}

class Arr<T> extends Schema<T[]> {
  constructor(private item: Schema<T>) { super(); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    if (!Array.isArray(v)) { issues.push({ path, message: 'Expected a list' }); return v as T[]; }
    return v.map((x, i) => this.item._run(x, [...path, i], issues));
  }
}

type Shape = Record<string, Schema<any>>;
type Out<S extends Shape> = { [K in keyof S]: S[K] extends Schema<infer T> ? T : never };

class Obj<S extends Shape> extends Schema<Out<S>> {
  constructor(private shape: S, private refines: ((v: Out<S>, ctx: Ctx) => void)[] = []) { super(); }
  pick<K extends keyof S>(keys: { [P in K]: true }) {
    const shape = Object.fromEntries(Object.keys(keys).map((k) => [k, this.shape[k]])) as Pick<S, K>;
    return new Obj(shape);
  }
  superRefine(fn: (v: Out<S>, ctx: Ctx) => void) { return new Obj(this.shape, [...this.refines, fn]); }
  protected run(v: unknown, path: (string | number)[], issues: Issue[]) {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const before = issues.length;
    const out = Object.fromEntries(Object.entries(this.shape).map(([k, s]) => [k, s._run(src[k], [...path, k], issues)])) as Out<S>;
    // like zod, cross-field rules only run once each field is valid
    if (issues.length === before) {
      for (const fn of this.refines) fn(out, { addIssue: (i) => issues.push({ path: [...path, ...(i.path ?? [])], message: i.message }) });
    }
    return out;
  }
}

export const z = {
  string: () => new Str(),
  number: () => new Num(),
  date: (o?: { message?: string }) => new DateS(o?.message),
  enum: <T extends string>(values: readonly [T, ...T[]], o?: { message?: string }) => new Enum<T>(values, o?.message),
  literal: <T extends string | number | boolean>(value: T) => new Literal(value),
  array: <T>(item: Schema<T>) => new Arr(item),
  object: <S extends Shape>(shape: S) => new Obj(shape),
};
