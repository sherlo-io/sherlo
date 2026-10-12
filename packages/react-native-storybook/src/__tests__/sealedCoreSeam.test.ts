/**
 * The seam (../sealedCore/seam.ts): the one open contract between the SDK and its sealed cores,
 * which sherlo-runner keeps a tracked copy of and types the cores against.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  COMPILED_CORE_NATIVE_METHODS,
  COMPILED_CORE_R8_KEEP_RULE,
  SHERLO_PROTOCOL_VERSION,
} from '../sealedCore/seam';
import type { SealedCoreHost, StorybookFacts } from '../sealedCore/seam';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const SEAM_FILE = path.join(SDK_ROOT, 'src', 'sealedCore', 'seam.ts');
const COMPILED_CORE_JAVA = path.join(
  SDK_ROOT,
  'android/src/main/java/io/sherlo/storybookreactnative/CompiledCore.java'
);
const CONSUMER_RULES = path.join(SDK_ROOT, 'android', 'consumer-rules.pro');

describe('the seam', () => {
  it('the seam imports nothing from the rest of the SDK', () => {
    const seamSource = fs.readFileSync(SEAM_FILE, 'utf8');

    // Every import, `export ... from`, `import()` and `require()` the file makes, as the compiler
    // reads them.
    const imported = ts
      .preProcessFile(seamSource, true, true)
      .importedFiles.map((importedFile) => importedFile.fileName);

    expect(imported).toEqual([]);
  });

  it('the seam lists every native method of CompiledCore and the R8 rule that keeps them', () => {
    const compiledCoreSource = fs.readFileSync(COMPILED_CORE_JAVA, 'utf8');
    const nativeMethodDeclaration = /\bnative\s+[\w[\]<>]+\s+(\w+)\s*\(/g;
    const nativeMethodsOfCompiledCore = [
      ...compiledCoreSource.matchAll(nativeMethodDeclaration),
    ].map((match) => match[1]);

    expect(nativeMethodsOfCompiledCore.length).toBeGreaterThan(0);
    expect([...COMPILED_CORE_NATIVE_METHODS].sort()).toEqual(nativeMethodsOfCompiledCore.sort());

    expect(fs.readFileSync(CONSUMER_RULES, 'utf8')).toContain(COMPILED_CORE_R8_KEEP_RULE);
  });

  it("the line's server half speaks the protocol version the seam names", () => {
    const { PROTOCOL_VERSION } = require(path.join(SDK_ROOT, 'metro', 'sherloLine.js'));

    expect(PROTOCOL_VERSION).toBe(SHERLO_PROTOCOL_VERSION);
  });

  it("the seam hands the core Storybook's stories, mocks and channel as plain facts, never Storybook's view", async () => {
    // Nothing the seam types names Storybook's view: no type of one, and no field or argument
    // that carries one, in the host the core is handed or in any call the SDK makes of the core.
    const namesInTheSeam = everyNameDeclaredIn(fs.readFileSync(SEAM_FILE, 'utf8'));
    expect(namesInTheSeam.filter((name) => /^view$|StorybookView/.test(name))).toEqual([]);

    // What Storybook's start() was handed, as Sherlo's start wrapper records it: the stories, the
    // story files with their parameters and mocks, and the project's preview annotations.
    const storyFile = {
      default: { title: 'Mocking/Switch' },
      First: { parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'first-mock' } } } } },
    };
    const facts: StorybookFacts = {
      storyIndex: {
        'mocking-switch--first': {
          id: 'mocking-switch--first',
          title: 'Mocking/Switch',
          name: 'First',
          importPath: './src/Switch.stories.tsx',
        },
      },
      storyFiles: { './src/Switch.stories.tsx': storyFile },
      previewAnnotations: [{ parameters: { sherlo: { mocks: { 'pkg/clock': { now: 0 } } } } }],
    };
    const channel = { on: () => {}, off: () => {}, emit: () => {} };
    (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__ =
      channel;

    vi.resetModules();
    const { recordStorybookFacts } = await import('../getStorybook/storybookFacts');
    const { getSealedCore } = await import('../sealedCore/loadSealedCore');
    recordStorybookFacts(facts);
    getSealedCore();
    const host = (globalThis as { __SHERLO_CORE__?: { installedWith?: SealedCoreHost } })
      .__SHERLO_CORE__?.installedWith;

    // The host hands the core those facts as they were recorded, and Storybook's channel.
    expect(host?.storybookFacts()).toBe(facts);
    expect(host?.storybookChannel()).toBe(channel);

    delete (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__;
    delete (globalThis as { __SHERLO_CORE__?: unknown }).__SHERLO_CORE__;
  });
});

/** Every name `source` declares: its types, their fields, and every argument they take. */
function everyNameDeclaredIn(source: string): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    const declaredName = (node as { name?: ts.Node }).name;
    if (declaredName && ts.isIdentifier(declaredName)) names.push(declaredName.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('seam.ts', source, ts.ScriptTarget.Latest, true));
  return names;
}
