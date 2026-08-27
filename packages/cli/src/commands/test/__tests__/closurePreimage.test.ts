/**
 * The sidecar closures' PRE-IMAGE - the inputs each digest was computed over.
 *
 * The dependency closure and the app source closure both build a structure, hash
 * it, and used to throw the structure away. They now keep it, and the digests
 * below are PINNED to values captured from the code as it stood BEFORE that
 * change: a bundle sidecar written by one CLI is compared by another, so a moved
 * digest would refuse bundles that are perfectly valid.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { computeAppSourceClosure, computeDependencyClosure } from '../bundleSidecar';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(dir: string, relativePath: string, value: unknown): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(value));
}

describe('dependency closure pre-image', () => {
  /**
   * A hoisted tree with a scope, and one package installed at two versions at
   * two depths - the case the name-keyed map exists to handle.
   */
  function makeInstalledTree(): string {
    const dir = makeTempDir('sherlo-dep-closure-');
    writeJson(dir, 'package.json', { name: 'app' });
    writeJson(dir, 'node_modules/react/package.json', { name: 'react', version: '18.2.0' });
    writeJson(dir, 'node_modules/@scope/lib/package.json', {
      name: '@scope/lib',
      version: '2.1.0',
    });
    writeJson(dir, 'node_modules/react/node_modules/loose/package.json', {
      name: 'loose',
      version: '1.0.1',
    });
    writeJson(dir, 'node_modules/loose/package.json', { name: 'loose', version: '1.2.0' });
    return dir;
  }

  it('hashes an installed tree to the pinned digest and keeps what it hashed', () => {
    const dir = makeInstalledTree();
    try {
      const closure = computeDependencyClosure(dir);

      expect(closure.source).toBe('node_modules');
      expect(closure.hash).toBe('4afaaf1efe61d17302996c4c0ed9cf7f01a10c6faaebbdeb16d61bfb14a5aaa0');
      expect(closure.installedPackages).toEqual([
        { name: '@scope/lib', versions: ['2.1.0'] },
        { name: 'loose', versions: ['1.0.1', '1.2.0'] },
        { name: 'react', versions: ['18.2.0'] },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashes declared ranges to the pinned digest, with no per-package pre-image', () => {
    const dir = makeTempDir('sherlo-dep-declared-');
    try {
      writeJson(dir, 'package.json', {
        name: 'p',
        dependencies: { react: '18.2.0' },
        devDependencies: { typescript: '5.0.0' },
      });

      const closure = computeDependencyClosure(dir);

      expect(closure.source).toBe('package.json');
      expect(closure.hash).toBe('1b1f9e775631a5fc39876fc70cbff8fcd31f6a8248d303d3630a3ffbd00c719e');
      // A package.json digest is taken over raw text, so there is nothing
      // per-package to keep - and null says so rather than pretending otherwise.
      expect(closure.installedPackages).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('app source closure pre-image', () => {
  it('hashes the module graph to the pinned digest and keeps the per-file digests', () => {
    const dir = makeTempDir('sherlo-app-closure-');
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, 'src/App.tsx'), 'export default 1;\n');
      fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1);\n');

      const closure = computeAppSourceClosure({
        projectRoot: dir,
        modulePaths: [
          'src/App.tsx',
          'index.js',
          // Excluded: dependency bytes are the dependency closure's job.
          'node_modules/react/index.js',
          // Named by the manifest but gone from the tree - recorded, not skipped.
          'src/Gone.tsx',
        ],
      });

      expect(closure.fileCount).toBe(3);
      expect(closure.hash).toBe('3bb22b9afcc002f7cc0e73f1916e659f50b3e307a7e0e708d522c6f6a1622a2b');
      expect(closure.files.map(({ path: filePath }) => filePath)).toEqual([
        'index.js',
        'src/App.tsx',
        'src/Gone.tsx',
      ]);
      expect(closure.files.find(({ path: filePath }) => filePath === 'src/Gone.tsx')?.digest).toBe(
        'missing'
      );
      // Digests only - the retained structure never carries a file's bytes.
      expect(JSON.stringify(closure)).not.toContain('console.log');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
