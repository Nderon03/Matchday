import { normaliseSupabaseUrl } from '../supabaseUrl';

describe('normaliseSupabaseUrl', () => {
  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
    ['  "https://abc.supabase.co/rest/v1"  ', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
    ['', ''],
  ])('%s → %s', (input, expected) => expect(normaliseSupabaseUrl(input)).toBe(expected));
});
