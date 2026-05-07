'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../metro/applySherloTransforms');

const POLYFILL_PATH = path.resolve(__dirname, '../../metro/polyfill.js');

// ---------------------------------------------------------------------------
// disabled-notifier polyfill injection
// ---------------------------------------------------------------------------

describe('applySherloTransforms - disabled-notifier polyfill (enabled: false)', () => {
  it('getPolyfills includes both polyfill.js and disabled-notifier.js when enabled: false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(polyfills).toContain(POLYFILL_PATH);
    const hasNotifier = polyfills.some((p: string) => p.endsWith('disabled-notifier.js'));
    expect(hasNotifier).toBe(true);
  });

  it('getPolyfills does NOT include disabled-notifier.js when enabled: true', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-enabled-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const hasNotifier = polyfills.some((p: string) => p.endsWith('disabled-notifier.js'));
    expect(hasNotifier).toBe(false);
  });

  it('getPolyfills does NOT include disabled-notifier.js when enabled is undefined (default)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-undef-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, {});
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const hasNotifier = polyfills.some((p: string) => p.endsWith('disabled-notifier.js'));
    expect(hasNotifier).toBe(false);
  });

  it('getPolyfills does NOT include disabled-notifier.js when no opts provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-noopts-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const hasNotifier = polyfills.some((p: string) => p.endsWith('disabled-notifier.js'));
    expect(hasNotifier).toBe(false);
  });

  it('disabled-notifier.js is written to disk at the expected cache path when enabled: false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-disk-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const notifierPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'disabled-notifier.js');
    const exists = fs.existsSync(notifierPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(true);
  });

  it('disabled-notifier.js contains sendNativeError(ERROR_STORYBOOK_DISABLED) call', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-content-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const notifierPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'disabled-notifier.js');
    const content = fs.readFileSync(notifierPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(content).toContain('sendNativeError');
    expect(content).toContain('ERROR_STORYBOOK_DISABLED');
    expect(content).toContain('Storybook is disabled in metro.config.js');
  });

  it('disabled-notifier.js resolves SherloModule via __turboModuleProxy or nativeModuleProxy', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-resolve-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const notifierPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'disabled-notifier.js');
    const content = fs.readFileSync(notifierPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(content).toContain('__turboModuleProxy');
    expect(content).toContain('nativeModuleProxy');
  });

  it('disabled-notifier.js does NOT contain a getMode or runtime-mode check', () => {
    // No JS-side mode gate: production safety lives on the native side
    // (same pattern as metro/polyfill.js, avoids Android JSI race).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-nomode-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const notifierPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'disabled-notifier.js');
    const content = fs.readFileSync(notifierPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(content).not.toContain('getMode');
    expect(content).not.toContain('__sherloRuntimeMode');
    expect(content).not.toContain("'testing'");
  });

  it('disabled-notifier.js is wrapped in try/catch with empty catch', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-trycatch-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const notifierPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'disabled-notifier.js');
    const content = fs.readFileSync(notifierPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(content).toContain('try {');
    expect(content).toContain('} catch (e) {}');
  });

  it('disabled-notifier.js path from getPolyfills matches the file on disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-notifier-path-match-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const polyfills: string[] = result.serializer.getPolyfills({});
    const notifierPolyfill = polyfills.find((p: string) => p.endsWith('disabled-notifier.js'));
    const exists = notifierPolyfill ? fs.existsSync(notifierPolyfill) : false;
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(notifierPolyfill).toBeTruthy();
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateDisabledNotifier export
// ---------------------------------------------------------------------------

describe('generateDisabledNotifier - exported function', () => {
  it('is exported from applySherloTransforms module', () => {
    expect(typeof applySherloTransforms.generateDisabledNotifier).toBe('function');
  });

  it('writes disabled-notifier.js at the given path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-gen-notifier-test-'));
    const notifierPath = path.join(tmpDir, 'disabled-notifier.js');
    applySherloTransforms.generateDisabledNotifier(notifierPath);
    const exists = fs.existsSync(notifierPath);
    const content = fs.readFileSync(notifierPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(true);
    expect(content).toContain('sendNativeError');
    expect(content).toContain('ERROR_STORYBOOK_DISABLED');
  });
});
