import { tidyTime, typeTime } from '../sessionDates';

describe('typing a kick-off time', () => {
  it('puts the colon in by itself', () => {
    expect(typeTime('1930')).toBe('19:30');
    expect(typeTime('19')).toBe('19');
    expect(typeTime('730')).toBe('7:30');
    expect(typeTime('193')).toBe('19:3'); // on its way to 19:30
    expect(typeTime('ab19x30')).toBe('19:30');
    expect(typeTime('193055')).toBe('19:30');
  });
  it('tidies on leaving the box', () => {
    expect(tidyTime('7:30')).toBe('07:30');
    expect(tidyTime('19')).toBe('19:00');
    expect(tidyTime('1930')).toBe('19:30');
    expect(tidyTime('25:00')).toBe('25:00'); // left for validation to flag
  });
});
