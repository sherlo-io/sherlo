import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// 'testing' so the activation mode guard lets activateMocks install.
vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import { activateMocks, clearMocks } from '../../mocking/registry';
import { startState } from '../../mocking/startState';

afterEach(() => clearMocks());

const START_STATE_MODULE = path.resolve(__dirname, '../../mocking/startState');

// What TypeScript says about `source` checked as a file of its own against this package's source.
function typeErrorsIn(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-start-state-'));
  const file = path.join(root, 'scene.ts');
  fs.writeFileSync(file, source, 'utf8');
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        target: 'ES2018',
        module: 'ESNext',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        types: [],
      },
      files: [file],
    }),
    'utf8'
  );
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
  try {
    execFileSync(process.execPath, [tsc, '-p', root, '--pretty', 'false'], { encoding: 'utf8' });
    return '';
  } catch (failure) {
    // Only what is said about the scene: the package's own files are type-checked by its build.
    const printed = (failure as { stdout: string }).stdout.split('\n');
    return printed.filter((line) => line.includes('scene.ts(')).join('\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function realClient() {
  return { token: null as string | null, user: { id: 'nobody', name: 'Nobody' }, calls: 0 };
}

describe('a scene gives a real object its start state', () => {
  it('a real object starts with the fields the scene gave it', () => {
    const client = realClient();
    activateMocks({});

    startState(client, { token: 'abc', user: { id: 'ada' } }).activate();

    // A field of a nested object is written without losing the nested object's other fields.
    expect(client).toEqual({ token: 'abc', user: { id: 'ada', name: 'Nobody' }, calls: 0 });
  });

  it('after the scene the object holds its own fields again', () => {
    const client = realClient();
    activateMocks({});
    startState(client, { token: 'abc', user: { id: 'ada' } }).activate();

    clearMocks();

    expect(client).toEqual(realClient());
  });

  it("a field the object's type lacks fails the type check", () => {
    const scene = (fields: string) =>
      [
        "import { startState } from '" + START_STATE_MODULE + "';",
        'declare const client: { token: string | null; user: { id: string } };',
        'startState(client, ' + fields + ');',
      ].join('\n');

    expect(typeErrorsIn(scene("{ token: 'abc', user: { id: 'ada' } }"))).toBe('');
    expect(typeErrorsIn(scene("{ tokn: 'abc' }"))).toContain('tokn');
    expect(typeErrorsIn(scene("{ user: { nick: 'ada' } }"))).toContain('nick');
  });
});
