import { contrastRatio, over, readableOn } from '../contrast';

describe('readable colours', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('darkens a bright colour just enough to read on white, and leaves readable ones alone', () => {
    for (const c of ['#FB923C', '#2DD4BF', '#67E8F9', '#F5B014', '#C7CED8', '#22C55E']) {
      const r = readableOn(c, '#FFFFFF');
      expect(contrastRatio(r, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(r, '#FFFFFF')).toBeLessThan(6.5); // not needlessly dark
    }
    expect(readableOn('#117E39', '#FFFFFF')).toBe('#117E39');
  });
  it('works on tinted backgrounds', () => {
    const bg = over('#FB923C', 0.15, '#FFFFFF');
    expect(contrastRatio(readableOn('#FB923C', bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
});
