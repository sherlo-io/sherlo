/**
 * THE RENDER LAYER IS PURE, AND THIS IS WHAT SAYS SO IN CODE.
 *
 * `src/render/` is state in, bytes out. Nothing in it may print, read the
 * process, await, or talk to the backend - because the whole value of the split
 * is that ONE renderer serves two callers: the real CLI, which prints what it
 * renders, and an expectation producer, which buffers it. The moment a renderer
 * reads `process.stdout.isTTY` or awaits a fetch, the producer stops being able
 * to reproduce what a user sees, and the byte-identity ratchet stops meaning
 * anything.
 *
 * IT SCANS SOURCE RATHER THAN BEHAVIOUR on purpose. A behavioural check would
 * only catch an impurity on a path some test happens to exercise; the bans below
 * are structural, so reading the text is the honest instrument. The CONTROL case
 * is what keeps the instrument honest in turn: a scan that stopped matching would
 * otherwise look exactly as green as a clean layer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const RENDER_DIR = path.resolve(__dirname, '..');

/**
 * What a renderer may not contain, and why. Each entry is wired to a reason, so a
 * failure names the rule rather than a regex.
 */
const BANS: { pattern: RegExp; what: string; why: string }[] = [
  {
    pattern: /\bconsole\./,
    what: 'console.*',
    why: 'a renderer returns bytes; a SINK decides where they go. Printing here means the producer cannot capture them.',
  },
  {
    pattern: /\bprocess\.(env|stdout|stderr|stdin|cwd|exit|platform)\b/,
    what: 'process.*',
    why: 'ambient must be a DECLARED input, not a read. A default that silently matches today is how expectations drift.',
  },
  {
    pattern: /\bawait\b|\basync\b/,
    what: 'async / await',
    why: 'a renderer that waits for something is holding logic. Move the await to the caller and pass it the answer.',
  },
  {
    pattern: /from '@sherlo\/sdk-client'/,
    what: 'an @sherlo/sdk-client import',
    why: 'the render layer must not be able to reach the backend at all.',
  },
  {
    pattern: /\bnew Date\b|Date\.now\(\)/,
    what: 'a wall-clock read',
    why: 'a clock on the render path makes a fixture unreproducible - the two-pass check exists because of exactly this.',
  },
];

function renderSources(): string[] {
  return fs
    .readdirSync(RENDER_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

/** Every ban a source text trips, as reader-facing sentences. */
function impurities(fileName: string, source: string): string[] {
  // Comments legitimately DISCUSS the banned things (this layer's headers argue
  // about console.log and process.env at length), so the scan reads code only.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  return BANS.filter((ban) => ban.pattern.test(code)).map(
    (ban) => `${fileName} contains ${ban.what} - ${ban.why}`
  );
}

describe('the render layer is pure', () => {
  it('has sources to scan (an emptied or renamed directory would pass by covering nothing)', () => {
    expect(renderSources().length).toBeGreaterThan(0);
  });

  it('no file under src/render/ prints, reads the process, awaits, or reaches the backend', () => {
    const found = renderSources().flatMap((fileName) =>
      impurities(fileName, fs.readFileSync(path.join(RENDER_DIR, fileName), 'utf8'))
    );
    expect(found).toEqual([]);
  });

  it('CONTROL: the scan still rejects every impurity it bans', () => {
    // One synthetic source per ban, so a regex that stopped matching reds here
    // instead of hollowing out the case above. Kept inline rather than committed
    // as files, because a committed impure renderer is a thing someone will
    // eventually import by accident.
    const controls: [string, string][] = [
      ['printer.ts', 'export const f = () => console.log("x");'],
      ['ambient.ts', 'export const f = () => process.env.SKIP_INTRO;'],
      ['waiter.ts', 'export const f = async () => { await g(); };'],
      ['client.ts', "import sdkClient from '@sherlo/sdk-client';"],
      ['clock.ts', 'export const f = () => new Date().toISOString();'],
    ];

    const missed = controls
      .filter(([name, source]) => impurities(name, source).length === 0)
      .map(([name]) => name);

    expect(missed, 'the purity scan no longer rejects a source it is supposed to').toEqual([]);
  });

  it('CONTROL: a renderer that only DISCUSSES the banned things is accepted', () => {
    // The headers in this layer argue about console.log and process.env by name.
    // A scan that read comments would red on the very files it exists to protect,
    // and the fix would be to delete the explanation - the worst possible outcome.
    const source = [
      '/** This used to be a console.log reading process.env; it is neither now. */',
      '// await was removed from here too.',
      'export const f = () => "bytes";',
    ].join('\n');

    expect(impurities('discussed.ts', source)).toEqual([]);
  });
});
