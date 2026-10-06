/**
 * The root reset script (scripts/reset.sh): where it reads the package token from.
 *
 * It runs in a stand-in repo folder whose `yarn` does nothing and whose pack-testing-apps.sh only
 * writes the token it was given, so the real clean, install and build never run.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// packages/react-native-storybook root: this file is at src/__tests__/.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RESET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'reset.sh');

const temporaryFolders: string[] = [];
afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

/** A stand-in repo folder, with an .env holding `envFileText` when given. */
function standInRepo(envFileText?: string): string {
  const repoFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-reset-'));
  temporaryFolders.push(repoFolder);
  fs.mkdirSync(path.join(repoFolder, 'bin'));
  fs.writeFileSync(path.join(repoFolder, 'bin', 'yarn'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  fs.mkdirSync(path.join(repoFolder, 'scripts'));
  fs.writeFileSync(
    path.join(repoFolder, 'scripts', 'pack-testing-apps.sh'),
    '#!/bin/bash\necho -n "$PACKAGE_TOKEN" > token-the-pack-got\n'
  );
  if (envFileText !== undefined) fs.writeFileSync(path.join(repoFolder, '.env'), envFileText);
  return repoFolder;
}

/** Runs reset.sh in the folder, with an environment that has no package token. */
function resetIn(repoFolder: string) {
  const { PACKAGE_TOKEN: _packageToken, ...environmentWithoutToken } = process.env;
  return spawnSync('bash', [RESET_SCRIPT], {
    cwd: repoFolder,
    env: {
      ...environmentWithoutToken,
      PATH: path.join(repoFolder, 'bin') + ':' + process.env.PATH,
    },
    encoding: 'utf8',
  });
}

describe('reset', () => {
  it('reset reads the package token from .env when the environment has none', () => {
    const repoFolder = standInRepo('PACKAGE_TOKEN=token-from-env-file\n');

    const result = resetIn(repoFolder);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(repoFolder, 'token-the-pack-got'), 'utf8')).toBe(
      'token-from-env-file'
    );
  });

  it('reset refuses when neither the environment nor .env has the package token', () => {
    const result = resetIn(standInRepo('SOMETHING_ELSE=1\n'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PACKAGE_TOKEN is set neither in the environment nor in .env');
  });
});
