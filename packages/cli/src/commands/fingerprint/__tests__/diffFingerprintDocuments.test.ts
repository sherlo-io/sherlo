/**
 * The pure diff: every kind of delta, named per package or per path, and the
 * changed-layer count `sherlo fingerprint --baseline` turns into its exit code.
 */
import { describe, expect, it } from 'vitest';
import { diffFingerprintDocuments } from '../diffFingerprintDocuments';
import type { FingerprintDocument } from '../fingerprintDocument';
import { renderDelta } from '../renderFingerprint';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function makeDocument(): FingerprintDocument {
  return {
    formatVersion: 1,
    cliVersion: '2.0.2',
    native: {
      hash: 'native-1',
      sources: [
        { type: 'file', id: 'ios/Podfile', hash: HASH_A },
        { type: 'dir', id: 'android', hash: HASH_A },
        { type: 'contents', id: 'expoConfig', hash: HASH_A },
      ],
    },
    dependencies: {
      hash: 'deps-1',
      source: 'node_modules',
      installedPackages: [
        { name: '@scope/lib', versions: ['2.1.0'] },
        { name: 'loose', versions: ['1.0.1', '1.2.0'] },
        { name: 'react', versions: ['18.2.0'] },
      ],
    },
    js: {
      android: {
        hash: 'js-1',
        fileCount: 2,
        files: [
          { path: 'src/App.tsx', digest: HASH_A },
          { path: 'src/Old.tsx', digest: HASH_A },
        ],
      },
    },
    base: {
      hash: 'base-1',
      workflow: 'bare',
      lockfiles: [{ file: 'yarn.lock', digest: HASH_A }],
      autolinkedModules: ['@scope/native@1.0.0', 'react-native-svg@15.0.0'],
    },
  };
}

describe('diffFingerprintDocuments', () => {
  it('reports every layer unchanged for two identical documents', () => {
    const delta = diffFingerprintDocuments(makeDocument(), makeDocument());

    expect(delta.changedLayerCount).toBe(0);
    expect(delta.layers.map((layer) => [layer.layer, layer.changed])).toEqual([
      ['native', false],
      ['dependencies', false],
      ['js android', false],
      ['base', false],
    ]);
    expect(renderDelta(delta).at(-1)).toBe('0 layer(s) changed');
  });

  it('names the changed, added and removed packages with versions on both sides', () => {
    const current = makeDocument();
    current.dependencies.hash = 'deps-2';
    current.dependencies.installedPackages = [
      { name: '@scope/lib', versions: ['2.1.0'] },
      { name: 'left-pad', versions: ['1.3.0'] },
      { name: 'react', versions: ['18.3.1'] },
    ];

    const delta = diffFingerprintDocuments(makeDocument(), current);
    const dependencies = delta.layers.find((layer) => layer.layer === 'dependencies');

    expect(dependencies?.changed).toBe(true);
    expect(dependencies?.entries).toEqual([
      { kind: 'added', name: 'left-pad', after: '1.3.0' },
      { kind: 'removed', name: 'loose', before: '1.0.1, 1.2.0' },
      { kind: 'changed', name: 'react', before: '18.2.0', after: '18.3.1' },
    ]);
    expect(renderDelta(delta)).toEqual([
      'native        unchanged',
      'dependencies  changed',
      '  + left-pad 1.3.0',
      '  - loose 1.0.1, 1.2.0',
      '  ~ react 18.2.0 -> 18.3.1',
      'js android    unchanged',
      'base          unchanged',
      '1 layer(s) changed',
    ]);
  });

  it('names a dependency closure source change before any package', () => {
    const current = makeDocument();
    current.dependencies = { hash: 'deps-2', source: 'yarn.lock', installedPackages: null };

    const delta = diffFingerprintDocuments(makeDocument(), current);
    const dependencies = delta.layers.find((layer) => layer.layer === 'dependencies');

    expect(dependencies?.entries[0]).toEqual({
      kind: 'changed',
      name: 'source',
      before: 'node_modules',
      after: 'yarn.lock',
    });
  });

  it('falls back to the digests when neither side has a per-package pre-image', () => {
    const baseline = makeDocument();
    baseline.dependencies = { hash: HASH_A, source: 'yarn.lock', installedPackages: null };
    const current = makeDocument();
    current.dependencies = { hash: HASH_B, source: 'yarn.lock', installedPackages: null };

    const delta = diffFingerprintDocuments(baseline, current);

    expect(renderDelta(delta)).toContain(`  ~ yarn.lock ${'a'.repeat(12)} -> ${'b'.repeat(12)}`);
  });

  it('names the changed, added and removed app source files with their digest prefixes', () => {
    const current = makeDocument();
    current.js.android = {
      hash: 'js-2',
      fileCount: 2,
      files: [
        { path: 'src/App.tsx', digest: HASH_B },
        { path: 'src/New.tsx', digest: HASH_C },
      ],
    };

    const delta = diffFingerprintDocuments(makeDocument(), current);
    const js = delta.layers.find((layer) => layer.layer === 'js android');

    expect(js?.entries).toEqual([
      { kind: 'changed', name: 'src/App.tsx', before: HASH_A, after: HASH_B },
      { kind: 'added', name: 'src/New.tsx', after: HASH_C },
      { kind: 'removed', name: 'src/Old.tsx', before: HASH_A },
    ]);
    expect(renderDelta(delta)).toEqual([
      'native        unchanged',
      'dependencies  unchanged',
      'js android    changed',
      `  ~ src/App.tsx ${'a'.repeat(12)} -> ${'b'.repeat(12)}`,
      `  + src/New.tsx ${'c'.repeat(12)}`,
      `  - src/Old.tsx ${'a'.repeat(12)}`,
      'base          unchanged',
      '1 layer(s) changed',
    ]);
  });

  it('diffs native file and dir sources by path, and names a contents source only', () => {
    const current = makeDocument();
    current.native.hash = 'native-2';
    current.native.sources = [
      { type: 'file', id: 'ios/Podfile', hash: HASH_B },
      { type: 'dir', id: 'android', hash: HASH_A },
      { type: 'contents', id: 'expoConfig', hash: HASH_B },
    ];

    const delta = diffFingerprintDocuments(makeDocument(), current);
    const native = delta.layers.find((layer) => layer.layer === 'native');

    expect(native?.entries).toEqual([
      { kind: 'changed', name: 'ios/Podfile', before: HASH_A, after: HASH_B },
      { kind: 'changed', name: 'expoConfig' },
    ]);
    expect(renderDelta(delta)).toContain('  ~ expoConfig');
  });

  it('diffs lockfiles by path and autolinked modules by package under the base layer', () => {
    const current = makeDocument();
    current.base.hash = 'base-2';
    current.base.lockfiles = [
      { file: 'ios/Podfile.lock', digest: HASH_C },
      { file: 'yarn.lock', digest: HASH_B },
    ];
    current.base.autolinkedModules = ['@scope/native@1.1.0', 'react-native-svg@15.0.0'];

    const delta = diffFingerprintDocuments(makeDocument(), current);
    const base = delta.layers.find((layer) => layer.layer === 'base');

    expect(base?.entries).toEqual([
      { kind: 'added', name: 'ios/Podfile.lock', after: HASH_C },
      { kind: 'changed', name: 'yarn.lock', before: HASH_A, after: HASH_B },
      { kind: 'changed', name: '@scope/native', before: '1.0.0', after: '1.1.0' },
    ]);
  });

  it('treats a layer computed on one side only as changed', () => {
    const current = makeDocument();
    current.js = {};

    const delta = diffFingerprintDocuments(makeDocument(), current);

    expect(delta.changedLayerCount).toBe(1);
    expect(renderDelta(delta)).toContain('js android    changed');
  });

  it('counts every changed layer in the summary line', () => {
    const current = makeDocument();
    current.native.hash = 'native-2';
    current.base.hash = 'base-2';
    current.dependencies.hash = 'deps-2';

    const delta = diffFingerprintDocuments(makeDocument(), current);

    expect(delta.changedLayerCount).toBe(3);
    expect(renderDelta(delta).at(-1)).toBe('3 layer(s) changed');
  });
});
