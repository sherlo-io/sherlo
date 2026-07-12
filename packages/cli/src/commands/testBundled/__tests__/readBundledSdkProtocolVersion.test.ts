/**
 * Tests for readBundledSdkProtocolVersion - the fail-soft reader that
 * resolves the SDK protocol version a bundled build requires, tolerant of
 * npm-aliased installs (name mismatch between specifier and package.json).
 *
 * Drives real fs + require.resolve against a scratch node_modules layout -
 * no module mocking, since the whole point is exercising real resolution.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBundledSdkProtocolVersion } from '../readBundledSdkProtocolVersion';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-read-sdk-protocol-version-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/** Create the node_modules/@sherlo/react-native-storybook package under tempDir. */
function installPackage(packageJsonContent: string | Record<string, unknown> | undefined): void {
  const packageDir = path.join(tempDir, 'node_modules', SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {};');

  if (packageJsonContent !== undefined) {
    const content =
      typeof packageJsonContent === 'string'
        ? packageJsonContent
        : JSON.stringify(packageJsonContent);
    fs.writeFileSync(path.join(packageDir, 'package.json'), content);
  }
}

describe('readBundledSdkProtocolVersion', () => {
  it('returns the version for an npm-aliased install whose package.json name differs from the specifier', () => {
    installPackage({ name: '@sherlo-io/react-native-storybook', version: '2.0.1' });

    expect(readBundledSdkProtocolVersion(tempDir)).toBe('2.0.1');
  });

  it('returns the version for a matching-name install', () => {
    installPackage({ name: SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME, version: '1.4.0' });

    expect(readBundledSdkProtocolVersion(tempDir)).toBe('1.4.0');
  });

  it('returns undefined when the package is not installed', () => {
    expect(readBundledSdkProtocolVersion(tempDir)).toBeUndefined();
  });

  it('returns undefined when package.json is unreadable', () => {
    installPackage(undefined);
    const packageDir = path.join(
      tempDir,
      'node_modules',
      SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME
    );
    // A directory named package.json makes readFileSync throw (EISDIR).
    fs.mkdirSync(path.join(packageDir, 'package.json'));

    expect(readBundledSdkProtocolVersion(tempDir)).toBeUndefined();
  });

  it('returns undefined when package.json is invalid JSON', () => {
    installPackage('{ this is not valid json');

    expect(readBundledSdkProtocolVersion(tempDir)).toBeUndefined();
  });

  it('returns undefined when the version field is absent', () => {
    installPackage({ name: '@sherlo-io/react-native-storybook' });

    expect(readBundledSdkProtocolVersion(tempDir)).toBeUndefined();
  });

  it('never throws across all failure modes', () => {
    installPackage('{ this is not valid json');
    expect(() => readBundledSdkProtocolVersion(tempDir)).not.toThrow();

    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-read-sdk-protocol-version-'));
    expect(() => readBundledSdkProtocolVersion(tempDir)).not.toThrow();
  });
});
