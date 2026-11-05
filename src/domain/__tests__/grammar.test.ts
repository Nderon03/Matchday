import { nameList, plural } from '../format';

describe('grammar helpers', () => {
  it('pluralises counts', () => {
    expect(plural(1, 'member')).toBe('1 member');
    expect(plural(0, 'member')).toBe('0 members');
    expect(plural(12, 'member')).toBe('12 members');
    expect(plural(1, 'person', 'people')).toBe('1 person');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
  it('lists names naturally', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Ben'])).toBe('Ben');
    expect(nameList(['Ben', 'Alex'])).toBe('Ben and Alex');
    expect(nameList(['Ben', 'Alex', 'Chris'])).toBe('Ben, Alex and Chris');
    expect(nameList(['Ben', 'Alex', 'Chris', 'Dan'])).toBe('Ben, Alex and 2 others');
    expect(nameList(['Ben', 'Alex', 'Chris', 'Dan', 'Eli'], 2)).toBe('Ben and 4 others');
  });
});
