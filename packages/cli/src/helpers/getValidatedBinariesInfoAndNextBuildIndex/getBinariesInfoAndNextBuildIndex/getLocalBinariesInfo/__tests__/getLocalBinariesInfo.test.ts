import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { TEST_STANDARD_COMMAND } from '../../../../../constants';
import getLocalBinariesInfo from '../getLocalBinariesInfo';

const tmpRoots: string[] = [];

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The .app directory must itself be named "*.app" - getLocalBinariesInfo branches on that suffix
function makeAppDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-app-'));
  tmpRoots.push(root);

  const appDir = path.join(root, 'MyApp.app');
  fs.mkdirSync(appDir);
  return appDir;
}

describe('getLocalBinariesInfo - iOS .app directory', () => {
  it('resolves sdkVersion: undefined when assets/sherlo.json is missing, instead of throwing', async () => {
    const appDir = makeAppDir();

    const result = await getLocalBinariesInfo({
      paths: { ios: appDir },
      platforms: ['ios'],
      projectRoot: appDir,
      command: TEST_STANDARD_COMMAND,
    });

    expect(result.ios?.sdkVersion).toBeUndefined();
  });

  it('resolves sdkVersion from a valid assets/sherlo.json', async () => {
    const appDir = makeAppDir();
    fs.mkdirSync(path.join(appDir, 'assets'));
    fs.writeFileSync(
      path.join(appDir, 'assets', 'sherlo.json'),
      JSON.stringify({ version: '1.2.3' })
    );

    const result = await getLocalBinariesInfo({
      paths: { ios: appDir },
      platforms: ['ios'],
      projectRoot: appDir,
      command: TEST_STANDARD_COMMAND,
    });

    expect(result.ios?.sdkVersion).toBe('1.2.3');
  });

  it('rejects with the existing invalid-JSON error when assets/sherlo.json is malformed', async () => {
    const appDir = makeAppDir();
    fs.mkdirSync(path.join(appDir, 'assets'));
    fs.writeFileSync(path.join(appDir, 'assets', 'sherlo.json'), '{not valid json');

    await expect(
      getLocalBinariesInfo({
        paths: { ios: appDir },
        platforms: ['ios'],
        projectRoot: appDir,
        command: TEST_STANDARD_COMMAND,
      })
    ).rejects.toThrow('Invalid assets/sherlo.json in iOS build');
  });
});
