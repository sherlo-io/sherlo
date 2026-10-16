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

  it("puts SHERLO_TOKEN in the job's env and ends green with a notice while the secret is missing", () => {
    expect(workflow).toMatch(/env:\n\s+SHERLO_TOKEN: \$\{\{ secrets\.SHERLO_TOKEN \}\}/);
    expect(workflow).toMatch(/name: Check the SHERLO_TOKEN secret\n\s+id: token\n/);
    expect(workflow).toContain('::notice::');
    expect(workflow).toContain('echo "present=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).not.toContain('::error::');
    expect(workflow).not.toContain('exit 1');
    // Every step after the check runs only once the secret is there.
    const stepsAfterTheCheck = workflow.split('id: token')[1].split('\n      - ').slice(1);
    expect(stepsAfterTheCheck).toHaveLength(4);
    for (const step of stepsAfterTheCheck) {
      expect(step).toContain("if: steps.token.outputs.present == 'true'");
    }
  });

  it('sets up Node 22 with the package manager cache setup-node knows, and none for bun', () => {
    expect(workflow).toMatch(/node-version: 22\n\s+cache: yarn\n/);
    expect(renderSherloWorkflow({ packageManager: 'bun' })).toMatch(/node-version: 22\n\n/);
  });

  it("installs with the project's package manager", () => {
    expect(workflow).toContain('run: yarn install --immutable');
    expect(renderSherloWorkflow({ packageManager: 'pnpm' })).toContain(
      'run: pnpm install --frozen-lockfile'
    );
  });
});
