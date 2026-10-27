/**
 * End-to-end tests for the action's body: run the script exactly as the composite
 * step runs it, against a stand-in CLI, and check what reaches $GITHUB_OUTPUT and
 * what the step's exit code becomes.
 *
 * THE POINT is that the step exits with the CLI's own code, and publishes the
 * review address as `url`.
 *
 * The last test is the OTHER end-to-end promise: run the script in a genuinely
 * shallow clone and the Action leaves the clone alone - the CLI deepens it itself, which is
 * what lets a workflow omit `fetch-depth`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const RUNNER = fileURLToPath(new URL('../runSherloTest.mjs', import.meta.url));

/** A stand-in CLI: echoes its argv, prints the keys it is told to, exits as told. */
const FAKE_CLI = `#!/usr/bin/env node
console.log('argv=' + JSON.stringify(process.argv.slice(2)));
if (process.env.FAKE_KEYS === 'completed') {
  console.log('🔗 Review: https://app.sherlo.io/build/7');
}
console.error('a line on stderr');
process.exit(Number(process.env.FAKE_EXIT || 0));
`;

const fixtures = [];

afterEach(() => {
  while (fixtures.length > 0) {
    fs.rmSync(fixtures.pop(), { recursive: true, force: true });
  }
});

function projectWithFakeCli() {
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-runner-')));
  fixtures.push(projectRoot);

  const packageDir = path.join(projectRoot, 'node_modules', 'sherlo');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'sherlo', version: '2.0.2', bin: './cli.js' })
  );
  fs.writeFileSync(path.join(packageDir, 'cli.js'), FAKE_CLI);

  return projectRoot;
}

/** Run the action's body the way the composite step does, and read what it left. */
function runAction({ inputs = {}, fake = {} } = {}) {
  const projectRoot = projectWithFakeCli();
  const outputFile = path.join(projectRoot, 'github-output.txt');

  const result = spawnSync(process.execPath, [RUNNER], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputFile,
      SHERLO_TOKEN: 'TOKEN',
      SHERLO_CONFIG: '',
      SHERLO_PROJECT_ROOT: '',
      SHERLO_PLATFORM: '',
      FAKE_KEYS: 'none',
      FAKE_EXIT: '0',
      ...inputs,
      ...fake,
    },
  });

  return {
    exitCode: result.status,
    log: `${result.stdout}${result.stderr}`,
    outputs: fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : '',
    argv: JSON.parse(/argv=(\[.*\])/.exec(result.stdout)?.[1] ?? '[]'),
  };
}

describe('the action body', () => {
  it('a completed run publishes the review URL as its only output', () => {
    const run = runAction({ fake: { FAKE_KEYS: 'completed', FAKE_EXIT: '0' } });

    expect(run.exitCode).toBe(0);
    expect(run.outputs).toBe('url=https://app.sherlo.io/build/7\n');
  });

  it('a run that printed no review address publishes nothing', () => {
    const run = runAction({ fake: { FAKE_KEYS: 'none', FAKE_EXIT: '0' } });

    expect(run.outputs).toBe('');
  });

  it('fails loudly when the project has no Sherlo CLI installed', () => {
    const emptyProject = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-runner-')));
    fixtures.push(emptyProject);

    const result = spawnSync(process.execPath, [RUNNER], {
      cwd: emptyProject,
      encoding: 'utf8',
      env: { ...process.env, SHERLO_TOKEN: 'TOKEN', GITHUB_OUTPUT: '' },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('No Sherlo CLI found');
  });

  it('invokes the verb, with no token and only the inputs that were given', () => {
    const run = runAction({
      inputs: { SHERLO_CONFIG: 'custom.json', SHERLO_PLATFORM: 'android' },
    });

    expect(run.argv).toEqual(['test', '--platform', 'android', '--config', 'custom.json']);
  });

  it('names the CLI that ran, and where it came from, before anything else', () => {
    const run = runAction({ fake: { FAKE_KEYS: 'completed' } });

    expect(run.log).toContain('Sherlo CLI: sherlo@2.0.2 (installed in your project)');
  });

  it('mirrors the CLI stderr into the step log (a failure is readable in CI)', () => {
    const run = runAction({ fake: { FAKE_KEYS: 'completed' } });

    expect(run.log).toContain('a line on stderr');
  });

  it('leaves a real shallow clone as it found it, because the CLI deepens it itself', () => {
    const projectRoot = shallowCloneWithFakeCli();

    const result = spawnSync(process.execPath, [RUNNER], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, SHERLO_TOKEN: 'TOKEN', GITHUB_OUTPUT: '', FAKE_KEYS: 'completed' },
    });

    // The action announces and fetches nothing: HEAD is still a lone grafted commit.
    expect(result.stdout).not.toContain('Shallow checkout detected');
    expect(result.stdout).not.toContain('::warning');
    const reachable = git(projectRoot, ['rev-list', '--count', '--first-parent', 'HEAD']);
    expect(Number(reachable.stdout.trim())).toBe(1);
  });
});

describe('the action step, one platform per job', () => {
  it.each([1, 2, 4])("the step exits with the CLI's own exit code (%i)", (code) => {
    const run = runAction({ fake: { FAKE_EXIT: String(code) } });

    expect(run.exitCode).toBe(code);
  });

  it('publishes the review URL of the run it opened or joined as url', () => {
    const run = runAction({ fake: { FAKE_KEYS: 'completed', FAKE_EXIT: '1' } });

    expect(run.outputs).toBe('url=https://app.sherlo.io/build/7\n');
  });
});

/* ========================================================================== */

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * A project checked out the way `actions/checkout` leaves one by default: a
 * depth-1 clone whose HEAD has no parents. Cloned over `file://` on purpose -
 * a plain local path makes git ignore `--depth` and hardlink the whole history,
 * which would silently turn this into a full-clone test.
 */
function shallowCloneWithFakeCli() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-shallow-')));
  fixtures.push(root);

  const origin = path.join(root, 'origin');
  fs.mkdirSync(origin);
  git(origin, ['init', '-q', '-b', 'main']);
  git(origin, ['config', 'user.email', 'test@sherlo.io']);
  git(origin, ['config', 'user.name', 'Sherlo Test']);
  for (let commit = 0; commit < 3; commit++) {
    fs.writeFileSync(path.join(origin, 'file.txt'), String(commit));
    git(origin, ['add', '.']);
    git(origin, ['commit', '-qm', `commit ${commit}`]);
  }

  const projectRoot = path.join(root, 'checkout');
  git(root, ['clone', '-q', '--depth=1', '--branch', 'main', `file://${origin}`, projectRoot]);

  const packageDir = path.join(projectRoot, 'node_modules', 'sherlo');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'sherlo', version: '2.0.2', bin: './cli.js' })
  );
  fs.writeFileSync(path.join(packageDir, 'cli.js'), FAKE_CLI);

  return projectRoot;
}
