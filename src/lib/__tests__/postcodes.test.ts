import { isOutcode, normalisePostcode } from '../postcodes';

describe('postcodes', () => {
  it.each([['nw72eu', 'NW7 2EU'], ['NW7 2EU', 'NW7 2EU'], [' sw1a 1aa ', 'SW1A 1AA'], ['m11ae', 'M1 1AE'], ['EC1A1BB', 'EC1A 1BB']])('normalises %s', (a, b) => {
    expect(normalisePostcode(a)).toBe(b);
  });
  it.each(['', 'hello', 'NW7', '12345', 'NW7 2E'])('rejects %s', (a) => expect(normalisePostcode(a)).toBeNull());
  it('recognises partial postcodes', () => {
    expect(isOutcode('NW7')).toBe(true);
    expect(isOutcode('sw1a')).toBe(true);
    expect(isOutcode('Mill Hill')).toBe(false);
  });
});
