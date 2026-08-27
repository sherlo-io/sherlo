/**
 * The document `--write` produces and `--baseline` reads: its shape, that the
 * same document serializes to the same bytes, and that a format it does not
 * know is refused with a message that says what to do.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FINGERPRINT_DOCUMENT_FORMAT_VERSION,
  readFingerprintDocument,
  serializeFingerprintDocument,
  writeFingerprintDocument,
  type FingerprintDocument,
} from '../fingerprintDocument';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-doc-'));
}

const DOCUMENT: FingerprintDocument = {
  formatVersion: 1,
  cliVersion: '2.0.2',
  native: { hash: 'native-1', sources: [{ type: 'contents', id: 'expoConfig', hash: 'h1' }] },
  dependencies: {
    hash: 'deps-1',
    source: 'node_modules',
    installedPackages: [{ name: 'react', versions: ['18.2.0'] }],
  },
  js: { android: { hash: 'js-1', fileCount: 1, files: [{ path: 'src/App.tsx', digest: 'h2' }] } },
  base: {
    hash: 'base-1',
    workflow: 'bare',
    lockfiles: [{ file: 'yarn.lock', digest: 'h3' }],
    autolinkedModules: ['react-native-svg@15.0.0'],
  },
};

describe('fingerprint document', () => {
  it('serializes with a fixed key order and a trailing newline', () => {
    const serialized = serializeFingerprintDocument(DOCUMENT);

    expect(Object.keys(JSON.parse(serialized))).toEqual([
      'formatVersion',
      'cliVersion',
      'native',
      'dependencies',
      'js',
      'base',
    ]);
    expect(serialized.endsWith('}\n')).toBe(true);
  });

  it('serializes the same document to the same bytes', () => {
    const copy = JSON.parse(JSON.stringify(DOCUMENT));

    expect(serializeFingerprintDocument(copy)).toBe(serializeFingerprintDocument(DOCUMENT));
  });

  it('round-trips through a file', () => {
    const dir = makeTempDir();
    try {
      const file = path.join(dir, 'fingerprint.json');
      writeFingerprintDocument(file, DOCUMENT);

      expect(readFingerprintDocument(file)).toEqual(DOCUMENT);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a file of a different format version and says how to fix it', () => {
    const dir = makeTempDir();
    try {
      const file = path.join(dir, 'fingerprint.json');
      fs.writeFileSync(file, JSON.stringify({ ...DOCUMENT, formatVersion: 99 }));

      expect(() => readFingerprintDocument(file)).toThrow(
        `has format version 99, but this CLI reads format version ${FINGERPRINT_DOCUMENT_FORMAT_VERSION}`
      );
      expect(() => readFingerprintDocument(file)).toThrow('sherlo fingerprint --write <file>');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a missing file, a non-JSON file and a file without its layers', () => {
    const dir = makeTempDir();
    try {
      expect(() => readFingerprintDocument(path.join(dir, 'missing.json'))).toThrow(
        'could not be read'
      );

      const notJson = path.join(dir, 'not.json');
      fs.writeFileSync(notJson, '{');
      expect(() => readFingerprintDocument(notJson)).toThrow('not valid JSON');

      const noLayers = path.join(dir, 'no-layers.json');
      fs.writeFileSync(noLayers, JSON.stringify({ formatVersion: 1, native: {} }));
      expect(() => readFingerprintDocument(noLayers)).toThrow('missing its "dependencies" layer');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
