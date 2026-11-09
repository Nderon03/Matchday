import { findPostcode } from '../postcodes';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe('postcode lookup', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('finds a postcode and remembers it', async () => {
    const f = jest.fn(() => ok({ result: { postcode: 'NW7 2EU', latitude: 51.6, longitude: -0.24, admin_district: 'Barnet' } }));
    global.fetch = f as any;
    expect((await findPostcode('nw72eu')).place?.postcode).toBe('NW7 2EU');
    expect((await findPostcode('NW7 2EU')).place?.area).toBe('Barnet');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('says "not found" for a postcode that does not exist', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })) as any;
    expect(await findPostcode('ZZ9 9ZZ')).toEqual({ place: null, unavailable: false });
  });
  it('says "unavailable" (not "not found") when there is no signal, after trying twice', async () => {
    const f = jest.fn(() => Promise.reject(new Error('Network request failed')));
    global.fetch = f as any;
    expect(await findPostcode('E8 1EJ')).toEqual({ place: null, unavailable: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
