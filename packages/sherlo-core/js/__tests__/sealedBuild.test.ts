/**
 * The sealed JS core, read back from a real build: each name is a rule the book marks on "The
 * sealed core". The build (esbuild + terser + javascript-obfuscator) runs once for the whole file.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSealedCore } from '../build.js';

const SOURCE_FOLDER = path.join(__dirname, '..', 'src');
const LERNA_JSON = path.join(__dirname, '..', '..', '..', '..', 'lerna.json');

let builtCore: string;
let headerLine: string;
let scrambledBody: string;

beforeAll(async () => {
  const output = await buildSealedCore();
  builtCore = fs.readFileSync(output, 'utf8');
  const firstNewline = builtCore.indexOf('\n');
  headerLine = builtCore.slice(0, firstNewline);
  scrambledBody = builtCore.slice(firstNewline + 1);
}, 60_000);

describe('the sealed JS core', () => {
  it('the built core starts with the header line naming its version and seam', () => {
    const version = JSON.parse(fs.readFileSync(LERNA_JSON, 'utf8')).version as string;
    expect(headerLine).toBe('// sherlo-core ' + JSON.stringify({ version, seam: 1 }));
  });

  it('the built core imports nothing', () => {
    // No module reaches out of the file: no bare import, no require, no dynamic import.
    expect(scrambledBody).not.toMatch(/\bimport\b/);
    expect(scrambledBody).not.toMatch(/\brequire\s*\(/);
  });

  it('the built core puts its version, seam and install on __SHERLO_CORE__', () => {
    const theGlobal: { __SHERLO_CORE__?: { version: string; seam: number; install: unknown } } = {};
    // The SDK evaluates the core in global scope with indirect eval; this is that global scope.
    new Function('globalThis', scrambledBody).call(theGlobal, theGlobal);

    const version = JSON.parse(fs.readFileSync(LERNA_JSON, 'utf8')).version as string;
    expect(theGlobal.__SHERLO_CORE__?.version).toBe(version);
    expect(theGlobal.__SHERLO_CORE__?.seam).toBe(1);
    expect(typeof theGlobal.__SHERLO_CORE__?.install).toBe('function');
  });

  it("the built core holds none of its source's function names", () => {
    const source = fs
      .readdirSync(SOURCE_FOLDER)
      .map((file) => fs.readFileSync(path.join(SOURCE_FOLDER, file), 'utf8'))
      .join('\n');
    const functionNames = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    expect(functionNames).toContain('enumerateStories');
    for (const name of functionNames) {
      expect(scrambledBody).not.toContain(name);
    }
  });
});
