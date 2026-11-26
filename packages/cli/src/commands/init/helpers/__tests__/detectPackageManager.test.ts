import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import detectPackageManager from '../detectPackageManager';

const madeFolders: string[] = [];

function projectWith(files: Record<string, string>): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-package-manager-'));
  madeFolders.push(folder);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    fs.writeFileSync(path.join(folder, name), content);
  }
  return folder;
}

afterEach(() => {
  for (const folder of madeFolders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

const PACKAGE_JSON = JSON.stringify({ name: 'app' });

describe('the package manager is read off the lockfile and the yarnPath', () => {
  it('reads a yarn.lock Yarn 1 wrote as Yarn 1', async () => {
    const folder = projectWith({
      'package.json': PACKAGE_JSON,
      'yarn.lock': '# yarn lockfile v1\n\n\nreact@19.3.0:\n  version "19.3.0"\n',
    });
    expect(await detectPackageManager(folder)).toBe('yarn');
  });

  it('reads a yarn.lock with the __metadata block as modern Yarn, with no packageManager field', async () => {
    const folder = projectWith({
      'package.json': PACKAGE_JSON,
      'yarn.lock': '__metadata:\n  version: 8\n  cacheKey: 10c0\n',
    });
    expect(await detectPackageManager(folder)).toBe('yarn@berry');
  });

  it('reads a .yarnrc.yml naming a yarnPath as modern Yarn', async () => {
    const folder = projectWith({
      'package.json': PACKAGE_JSON,
      'yarn.lock': '',
      '.yarnrc.yml': 'yarnPath: .yarn/releases/yarn-4.3.1.cjs\n',
    });
    expect(await detectPackageManager(folder)).toBe('yarn@berry');
  });

  it('reads the lockfile of the workspace root above an app', async () => {
    const root = projectWith({
      'package.json': PACKAGE_JSON,
      'yarn.lock': '__metadata:\n  version: 8\n',
      'apps/mobile/package.json': PACKAGE_JSON,
    });
    expect(await detectPackageManager(path.join(root, 'apps/mobile'))).toBe('yarn@berry');
  });

  it('leaves another manager as the detector names it', async () => {
    const folder = projectWith({ 'package.json': PACKAGE_JSON, 'package-lock.json': '{}' });
    expect(await detectPackageManager(folder)).toBe('npm');
  });

  it('names no manager when no lockfile and no packageManager field say one', async () => {
    const folder = projectWith({ 'package.json': PACKAGE_JSON });
    await expect(detectPackageManager(folder)).rejects.toThrow(
      "Can't tell which package manager this app uses"
    );
  });
});
