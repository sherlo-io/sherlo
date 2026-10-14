/**
 * Every test app under testing/ installs with the Yarn release this repository ships. An app whose
 * .yarnrc.yml names a release file that is gone fails its install before any build starts, and
 * nothing else notices.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// packages/react-native-storybook root: this file is at src/__tests__/.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TESTING_DIR = path.join(REPO_ROOT, 'testing');

describe('test apps', () => {
  it('each test app names a Yarn release the repository ships', () => {
    const checked: string[] = [];

    for (const entry of fs.readdirSync(TESTING_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const appDir = path.join(TESTING_DIR, entry.name);
      const yarnrcPath = path.join(appDir, '.yarnrc.yml');
      if (!fs.existsSync(yarnrcPath)) continue;

      const yarnPath = /^yarnPath:\s*(\S+)\s*$/m.exec(fs.readFileSync(yarnrcPath, 'utf8'))?.[1];
      if (!yarnPath) continue;

      const releaseFile = path.resolve(appDir, yarnPath);
      expect(fs.existsSync(releaseFile), `${entry.name}: ${yarnPath} does not exist`).toBe(true);

      const packageJsonPath = path.join(appDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageManager = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).packageManager;
        if (typeof packageManager === 'string') {
          const releaseVersion = /yarn-(\d+\.\d+\.\d+)\.cjs$/.exec(releaseFile)?.[1];
          expect(`yarn@${releaseVersion}`, `${entry.name}: packageManager vs ${yarnPath}`).toBe(
            packageManager.split('+')[0]
          );
        }
      }
      checked.push(entry.name);
    }

    expect(checked.length).toBeGreaterThan(0);
  });
});
