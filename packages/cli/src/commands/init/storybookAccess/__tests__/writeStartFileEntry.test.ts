/**
 * THE APP ENTRY THE STORYBOOK ENTRY REQUIRES (writeStartFile.ts): a path, never a bare name.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import writeStartFile from '../writeStartFile';

const START_FILE = [
  "import { registerRootComponent } from 'expo';",
  "import { view } from './storybook.requires';",
  '',
  'registerRootComponent(view.getStorybookUI({}));',
  '',
].join('\n');

let root: string;

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe("the Storybook entry's require of the app", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-start-entry-'));
    write('.rnstorybook/index.tsx', START_FILE);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("the Storybook entry requires the app's entry by a relative path when package.json names no main", () => {
    write('package.json', JSON.stringify({ name: 'acme-app' }));
    write('index.ts', '');

    writeStartFile(root);

    expect(read('.rnstorybook/index.tsx')).toContain("require('../index');");
  });

  it('the Storybook entry keeps requiring the entry package.json names when it names one', () => {
    write('package.json', JSON.stringify({ name: 'acme-app', main: 'src/main.js' }));
    write('src/main.js', '');
    write('index.ts', '');

    writeStartFile(root);

    expect(read('.rnstorybook/index.tsx')).toContain("require('../src/main');");
  });

  it('the Storybook entry is left as it is, with one line said, when the app has no entry', () => {
    write('package.json', JSON.stringify({ name: 'acme-app' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(writeStartFile(root)).toBeNull();

    expect(read('.rnstorybook/index.tsx')).toBe(START_FILE);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("init says in content's words that it found no app entry", () => {
    write('package.json', JSON.stringify({ name: 'acme-app' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    writeStartFile(root);

    expect(log).toHaveBeenCalledWith(
      'Sherlo init found no app entry: "main" in package.json names no file and the project root has no index file, so the Storybook entry file is unchanged. Set "main" to your app\'s entry file and run npx sherlo init again'
    );
  });
});
