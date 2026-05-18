import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const MOCK_APP_PKG = JSON.stringify({
  dependencies: {
    'react-native': '0.81.5',
    'react-native-reanimated': '^4.2.1',
    'react-native-worklets': '^0.8.0',
    'react-native-gesture-handler': '^2.30.0',
  },
});

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn((p: unknown) => {
    if (String(p).endsWith('package.json')) return MOCK_APP_PKG;
    return Buffer.alloc(0);
  }),
  rmSync: vi.fn(),
}));

vi.mock('./sb-version.js', () => ({
  applySbVersion: vi.fn(),
  resetSbVersion: vi.fn(),
  SB_VERSIONS: ['sb10', 'sb9', 'sb8'],
}));

vi.mock('./variant.js', () => ({
  applyVariant: vi.fn(),
  resetFixture: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { buildNativeApp, buildApp } from './app-builder.js';

const mockExec = vi.mocked(execFileSync);
const mockExists = vi.mocked(existsSync);
const mockMkdir = vi.mocked(mkdirSync);
const mockCopy = vi.mocked(copyFileSync);
const mockReaddir = vi.mocked(readdirSync);

function setupMocks({ nativeCacheHit = false, splicedCacheHit = false }: { nativeCacheHit?: boolean; splicedCacheHit?: boolean } = {}): void {
  mockExists.mockImplementation((p: any) => {
    const s = String(p);
    if (!s.endsWith('app-release.apk')) return false;
    if (s.includes('/native/')) return nativeCacheHit;
    if (s.includes('/spliced/')) return splicedCacheHit;
    return false;
  });
  mockReaddir.mockReturnValue([] as any);
  mockExec.mockReturnValue('' as any);
  mockMkdir.mockReturnValue(undefined as any);
  mockCopy.mockReturnValue(undefined);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── buildNativeApp() – SHA determinism ──────────────────────────────────────

describe('buildNativeApp() – SHA determinism', () => {
  it('produces the same cache path on repeated calls with identical mock inputs', () => {
    setupMocks();

    const capturedDirs: string[] = [];
    mockMkdir.mockImplementation((p: any) => {
      capturedDirs.push(String(p));
      return undefined as any;
    });

    buildNativeApp('test-app');
    buildNativeApp('test-app');

    const nativeDirs = capturedDirs.filter(d => d.includes('/native/'));
    expect(nativeDirs).toHaveLength(2);
    expect(nativeDirs[0]).toBe(nativeDirs[1]);
    expect(nativeDirs[0]).toMatch(/[a-f0-9]{64}$/);
  });
});

// ── buildNativeApp() – cache hit ────────────────────────────────────────────

describe('buildNativeApp() – cache hit', () => {
  it('returns the cached APK path without calling gradlew', () => {
    setupMocks({ nativeCacheHit: true });

    const apkPath = buildNativeApp('test-app');

    expect(apkPath).toMatch(/app-release\.apk$/);
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('ignores cache and rebuilds when force: true', () => {
    setupMocks({ nativeCacheHit: true });

    buildNativeApp('test-app', { force: true });

    expect(mockExec).toHaveBeenCalledWith('./gradlew', ['assembleRelease'], expect.any(Object));
  });
});

// ── buildNativeApp() – cache miss ───────────────────────────────────────────

describe('buildNativeApp() – cache miss', () => {
  it('invokes gradlew assembleRelease with 10-minute timeout', () => {
    setupMocks();

    buildNativeApp('test-app');

    expect(mockExec).toHaveBeenCalledWith(
      './gradlew',
      ['assembleRelease'],
      expect.objectContaining({ timeout: 1_200_000, stdio: 'inherit' }),
    );
  });

  it('copies the built APK into the SHA-keyed native cache directory', () => {
    setupMocks();

    buildNativeApp('test-app');

    expect(mockCopy).toHaveBeenCalledWith(
      expect.stringContaining('app-release.apk'),
      expect.stringContaining('app-release.apk'),
    );
    const [src, dst] = mockCopy.mock.calls[0]!;
    expect(String(src)).toMatch(/apk\/release\/app-release\.apk$/);
    expect(String(dst)).toMatch(/\.builds\/test-app\/native\/[a-f0-9]{64}\/app-release\.apk$/);
  });

  it('returns the cache path string', () => {
    setupMocks();

    const result = buildNativeApp('test-app');

    expect(result).toMatch(/\.builds\/test-app\/native\/[a-f0-9]{64}\/app-release\.apk$/);
  });
});

// ── buildApp() ───────────────────────────────────────────────────────────────

describe('buildApp()', () => {
  it('returns the fixed package name for the consolidated base app', () => {
    setupMocks({ nativeCacheHit: true, splicedCacheHit: true });

    const result = buildApp({ appName: 'test-app', sbVersion: 'sb10' });

    expect(result.packageName).toBe('com.sherlo.integrationtests');
  });

  it('returns cacheHit: true when both native and spliced APKs are cached', () => {
    setupMocks({ nativeCacheHit: true, splicedCacheHit: true });

    const result = buildApp({ appName: 'test-app', sbVersion: 'sb10' });

    expect(result.cacheHit).toBe(true);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('calls gradlew assembleRelease when native APK is not cached', () => {
    setupMocks({ nativeCacheHit: false, splicedCacheHit: true });

    buildApp({ appName: 'test-app', sbVersion: 'sb10' });

    expect(mockExec).toHaveBeenCalledWith('./gradlew', ['assembleRelease'], expect.any(Object));
  });
});
