/**
 * Every step of every tour points at something that exists: a <Spot id="…"> (or tourRef) in the
 * app for each target, so tours never point at nothing or the wrong place after a screen changes.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const files = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === '__tests__' ? [] : files(path.join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);

describe('screen tours', () => {
  const source = files('.').map(read).join('\n');
  const tours = read('features/screenTours.ts');
  const targets = [...tours.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]);
  // ids are written literally, or as `${d.is_self ? 'profile.x' : 'player.x'}`, or `help.${id}`
  const has = (id: string) => source.includes(`id="${id}"`) || source.includes(`'${id}'`) || source.includes(`tourRef('${id}')`);

  it('has steps', () => expect(targets.length).toBeGreaterThan(60));
  it.each(targets.filter((id) => !id.startsWith('help.')))('%s is marked on its screen', (id) => {
    expect(has(id)).toBe(true);
  });
  it('every tour ends on its help button, and each screen with a tour shows the button', () => {
    const ids = [...tours.matchAll(/^ {2}'?([a-z-]+)'?: tour\('([a-z-]+)'/gm)];
    expect(ids.length).toBeGreaterThan(20);
    for (const [, key, id] of ids) {
      expect(key).toBe(id);
      expect(source.includes(`<ScreenHelp id="${id}"`)).toBe(true);
    }
  });
});
