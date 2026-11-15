import { z } from '../schema';
import { emailSchema, groupSchema, passwordSchema, profileSchema, sessionSchema, signUpSchema, usernameSchema, fieldErrors } from '../validation';

describe('form validator', () => {
  it('strings: trim, lengths, patterns, email', () => {
    expect(usernameSchema.safeParse('  jo_12 ')).toEqual({ success: true, data: 'jo_12' });
    expect(usernameSchema.safeParse('jo').error?.issues[0].message).toBe('At least 3 characters');
    expect(usernameSchema.safeParse('a b c').error?.issues[0].message).toBe('Letters, numbers and underscores only');
    expect(passwordSchema.safeParse('abcdefgh').error?.issues.map((i) => i.message)).toEqual(['Include a number']);
    expect(emailSchema.safeParse(' sam@example.co.uk ').data).toBe('sam@example.co.uk');
    for (const bad of ['nope', 'a@b', '@x.com', 'a..b@x.com', 'a b@x.com']) expect(emailSchema.safeParse(bad).success).toBe(false);
  });
  it('objects: field paths, optional, literal fallbacks, enums, pick', () => {
    expect(profileSchema.safeParse({ display_name: 'Sam', bio: '', position: 'GK' }).success).toBe(true);
    expect(profileSchema.safeParse({ display_name: 'Sam', position: 'GK' }).success).toBe(true);
    const r = profileSchema.safeParse({ display_name: ' ', bio: 'x'.repeat(281), position: 'XX' });
    expect(fieldErrors(r.error!)).toEqual({ display_name: 'Required', bio: 'At most 280 characters', position: 'Choose an option' });
    expect(groupSchema.safeParse({ name: 'FC', visibility: 'private', join_policy: 'open' }).success).toBe(true);
    const p = signUpSchema.pick({ displayName: true, username: true }).safeParse({ displayName: 'Jo', username: 'jo_1', email: 'nope' });
    expect(p.success).toBe(true);
  });
  it('cross-field rules run once the fields are valid', () => {
    const base = { name: 'Weds', starts_at: new Date(Date.now() + 86400_000), duration_minutes: 60, postcode: 'E8 1AA', format_size: 5, max_attendance: 10,
      visibility: 'group', payment_mode: 'upfront', price_pence: 50, group_id: null, invitee_ids: [] };
    expect(Object.keys(fieldErrors(sessionSchema.safeParse(base).error!)).sort()).toEqual(['price_pence', 'visibility']);
    expect(Object.keys(fieldErrors(sessionSchema.safeParse({ ...base, format_size: 3 }).error!))).toEqual(['format_size']);
    expect(sessionSchema.safeParse({ ...base, group_id: 'not-a-uuid' }).success).toBe(false);
    expect(z.array(z.number().int()).safeParse([1, 2.5]).error?.issues[0].path).toEqual([1]);
  });
});
