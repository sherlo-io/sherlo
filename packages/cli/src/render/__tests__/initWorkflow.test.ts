/**
 * THE GITHUB WORKFLOW `sherlo init` WRITES runs the action this repository publishes the way the
 * action and the docs say it runs: one job per platform, the token in the job's env, and only the
 * inputs `action.yml` declares - an undeclared one makes GitHub warn "Unexpected input".
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { renderSherloWorkflow } from '../initWorkflow';

const ACTION_FILE = path.resolve(__dirname, '..', '..', '..', '..', '..', 'action.yml');

/** The keys one YAML block holds, read from the lines indented one level under its key line. */
function keysUnder(lines: string[], keyLineIndex: number): string[] {
  const keyIndent = lines[keyLineIndex].search(/\S/);
  const blockEnd = lines.findIndex(
    (line, index) => index > keyLineIndex && line.trim() !== '' && line.search(/\S/) <= keyIndent
  );
  const block = lines.slice(keyLineIndex + 1, blockEnd === -1 ? undefined : blockEnd);
  const childIndent = Math.min(
    ...block.filter((line) => line.trim() !== '').map((line) => line.search(/\S/))
  );

  return block.flatMap((line) => {
    const key = /^\s*([\w-]+):/.exec(line);
    return key && line.search(/\S/) === childIndent ? [key[1]] : [];
  });
}

/** The inputs `action.yml` declares. */
function declaredInputs(): string[] {
  const lines = fs.readFileSync(ACTION_FILE, 'utf8').split('\n');
  return keysUnder(lines, lines.indexOf('inputs:'));
}

/** The inputs the workflow's step passes to the Sherlo action, under its `with:`. */
function inputsPassedToTheAction(workflow: string): string[] {
  const lines = workflow.split('\n');
  const actionLine = lines.findIndex((line) => /uses: sherlo-io\/sherlo@/.test(line));
  const withLine = lines.findIndex((line, index) => index > actionLine && /^\s+with:$/.test(line));
  return keysUnder(lines, withLine);
}

describe('the workflow sherlo init writes', () => {
  const workflow = renderSherloWorkflow({ packageManager: 'yarn' });

  it('passes the Sherlo action only inputs action.yml declares', () => {
    const declared = declaredInputs();
    expect(declared).toContain('platform');

    const passed = inputsPassedToTheAction(workflow);
    expect(passed).not.toEqual([]);
    expect(passed.filter((input) => !declared.includes(input))).toEqual([]);
  });

  it('runs one job per platform, Android on ubuntu-latest and iOS on macos-latest, each naming its platform', () => {
    expect(workflow).toMatch(/- platform: android\n\s+runs-on: ubuntu-latest/);
    expect(workflow).toMatch(/- platform: ios\n\s+runs-on: macos-latest/);
    expect(workflow).toContain('runs-on: ${{ matrix.runs-on }}');
    expect(workflow).toMatch(/with:\n\s+platform: \$\{\{ matrix\.platform \}\}/);
  });

  it('signs in through GitHub with no secret, and asks for a notice rather than a failure until GitHub is connected', () => {
    expect(workflow).toMatch(/permissions:\n\s+contents: read\n\s+id-token: write\n/);
    expect(workflow).toMatch(/env:\n(\s+#.*\n)?\s+SHERLO_UNTIL_CONNECTED: notice\n/);
    expect(workflow).not.toContain('SHERLO_TOKEN');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).toContain('Connect GitHub');
  });

  it('sets up Node 22 with the package manager cache setup-node knows, and none for bun or Yarn 2+', () => {
    expect(workflow).toMatch(/node-version: 22\n\s+cache: yarn\n/);
    expect(renderSherloWorkflow({ packageManager: 'bun' })).toMatch(/node-version: 22\n\n/);
    expect(renderSherloWorkflow({ packageManager: 'yarn@berry' })).not.toContain('cache:');
  });

  it("installs exactly the lock file's versions, in each package manager's own words", () => {
    const installLine = (
      packageManager: Parameters<typeof renderSherloWorkflow>[0]['packageManager']
    ) => /run: (.+)\n\n\s+- name: Run Sherlo/.exec(renderSherloWorkflow({ packageManager }))?.[1];

    expect(installLine('npm')).toBe('npm ci');
    expect(installLine('yarn')).toBe('yarn install --frozen-lockfile');
    expect(installLine('yarn@berry')).toBe('yarn install --immutable');
    expect(installLine('pnpm')).toBe('pnpm install --frozen-lockfile');
    expect(installLine('bun')).toBe('bun install --frozen-lockfile');
  });

  it('puts the package managers GitHub lacks on the machine: pnpm and Bun before Node, Yarn 2+ through corepack after it', () => {
    const pnpm = renderSherloWorkflow({ packageManager: 'pnpm' });
    expect(pnpm.indexOf('pnpm/action-setup@')).toBeGreaterThan(-1);
    expect(pnpm.indexOf('pnpm/action-setup@')).toBeLessThan(pnpm.indexOf('actions/setup-node@'));

    const bun = renderSherloWorkflow({ packageManager: 'bun' });
    expect(bun.indexOf('oven-sh/setup-bun@')).toBeGreaterThan(-1);

    const berry = renderSherloWorkflow({ packageManager: 'yarn@berry' });
    expect(berry.indexOf('npm install --global corepack@latest')).toBeGreaterThan(
      berry.indexOf('actions/setup-node@')
    );
    expect(berry).toContain('corepack enable');

    expect(renderSherloWorkflow({ packageManager: 'npm' })).not.toMatch(
      /action-setup|setup-bun|corepack/
    );
  });

  it("pins the developer's version only when package.json names no package manager", () => {
    expect(renderSherloWorkflow({ packageManager: 'pnpm' })).toMatch(
      /pnpm\/action-setup@v6\n\n\s+- uses: actions\/setup-node@/
    );
    expect(renderSherloWorkflow({ packageManager: 'pnpm', pinnedVersion: '9.15.0' })).toMatch(
      /pnpm\/action-setup@v6\n\s+with:\n\s+version: 9\.15\.0\n/
    );
    expect(renderSherloWorkflow({ packageManager: 'bun', pinnedVersion: '1.3.9' })).toMatch(
      /oven-sh\/setup-bun@v2\n\s+with:\n\s+bun-version: 1\.3\.9\n/
    );
  });
});
