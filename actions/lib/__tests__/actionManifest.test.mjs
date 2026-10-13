/**
 * The action manifest is YAML that GitHub parses before any of our code runs, so a
 * typo in it is not a failing test but a workflow that cannot start at all. These
 * tests load it and check the contract the runner script relies on: every input the
 * runner reads is declared and reaches it through the step's env, and the caches
 * the action keeps are the ones the page names.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const rootAction = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'action.yml'), 'utf8'));
const steps = rootAction.runs.steps;
const cacheStep = steps.find((step) => step.uses?.startsWith('actions/cache'));
const gradleStep = steps.find((step) => step.uses?.startsWith('gradle/actions/setup-gradle'));

describe('the action manifest', () => {
  it('is a composite action whose last step runs the runner', () => {
    expect(rootAction.runs.using).toBe('composite');
    expect(steps.at(-1).run).toContain('lib/runSherloTest.mjs');
  });

  it('declares every input the run reads, including the prebuilt-bundle pair', () => {
    expect(Object.keys(rootAction.inputs)).toEqual([
      'platform',
      'config',
      'project-root',
      'bundle-dir',
      'emit-bundle-dir',
      'working-directory',
    ]);
  });

  it('passes each input to the runner as the env var the runner reads', () => {
    // The runner reads env, never argv. That makes this mapping the whole input
    // surface of the action.
    expect(steps.at(-1).env).toEqual({
      SHERLO_PLATFORM: '${{ inputs.platform }}',
      SHERLO_CONFIG: '${{ inputs.config }}',
      SHERLO_PROJECT_ROOT: '${{ inputs.project-root }}',
      SHERLO_BUNDLE_DIR: '${{ inputs.bundle-dir }}',
      SHERLO_EMIT_BUNDLE_DIR: '${{ inputs.emit-bundle-dir }}',
    });
  });
});

describe('the action manifest, one platform per job', () => {
  it('declares no android or ios input', () => {
    expect(rootAction.inputs).not.toHaveProperty('android');
    expect(rootAction.inputs).not.toHaveProperty('ios');
  });

  it('declares no token input and sets no SHERLO_TOKEN on its step', () => {
    expect(rootAction.inputs).not.toHaveProperty('token');
    for (const step of steps) expect(step.env ?? {}).not.toHaveProperty('SHERLO_TOKEN');
  });

  it("keeps Xcode's compilation cache on an iOS job, with a rolling key per runner", () => {
    expect(cacheStep.if).toBe("inputs.platform == 'ios'");
    expect(cacheStep.with.path).toBe(
      '~/Library/Developer/Xcode/DerivedData/CompilationCache.noindex'
    );
    expect(cacheStep.with.key).toBe('sherlo-xcode-${{ runner.os }}-${{ github.sha }}');
    expect(cacheStep.with['restore-keys'].trim()).toBe('sherlo-xcode-${{ runner.os }}-');
  });

  it("keeps Gradle's home on an Android job through setup-gradle", () => {
    expect(gradleStep.if).toBe("inputs.platform == 'android'");
  });

  it('keeps no app build cache on CI', () => {
    const cachedPaths = steps.filter((step) => step.with?.path).map((step) => step.with.path);

    expect(cachedPaths).toEqual([cacheStep.with.path]);
  });

  it('publishes url as its only output', () => {
    expect(Object.keys(rootAction.outputs)).toEqual(['url']);
  });
});
