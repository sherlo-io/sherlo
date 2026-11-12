import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { installedVersionOf } from '../installedVersion';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function packageWith(files: Record<string, string>): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-installed-version-'));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    fs.writeFileSync(path.join(folder, name), content);
  }
  return folder;
}

const SHERLO = '@sherlo/react-native-storybook';
const NATIVE_FILES = { 'ios/A.m': 'a', 'android/A.kt': 'b', 'x.podspec': 'c' };

describe('the version slot of a module entry', () => {
  it('reads another module version from its package.json', () => {
    const folder = packageWith({ 'package.json': JSON.stringify({ version: '2.3.4' }) });

    expect(installedVersionOf('react-native-maps', folder)).toBe('2.3.4');
  });

  it('is unknown when the package is not installed', () => {
    expect(installedVersionOf('react-native-maps', null)).toBe('unknown');
  });

  it('gives the Sherlo package a hash of its ios, android and podspec files, not its version', () => {
    const one = packageWith({
      ...NATIVE_FILES,
      'package.json': JSON.stringify({ version: '1.0.0' }),
    });
    const two = packageWith({
      ...NATIVE_FILES,
      'package.json': JSON.stringify({ version: '9.9.9' }),
    });
    const podspecChanged = packageWith({ ...NATIVE_FILES, 'x.podspec': 'd' });

    expect(installedVersionOf(SHERLO, one)).toBe(installedVersionOf(SHERLO, two));
    expect(installedVersionOf(SHERLO, podspecChanged)).not.toBe(installedVersionOf(SHERLO, one));
  });

  it('keeps the Sherlo hash when a build writes a .cxx folder or a .DS_Store into the package', () => {
    const clean = packageWith(NATIVE_FILES);
    const built = packageWith({
      ...NATIVE_FILES,
      'android/.cxx/Debug/out': 'x',
      'ios/.DS_Store': 'x',
    });

    expect(installedVersionOf(SHERLO, built)).toBe(installedVersionOf(SHERLO, clean));
  });
});
