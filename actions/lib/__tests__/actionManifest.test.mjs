/**
 * The action manifests are YAML that GitHub parses before any of our code runs, so a
 * typo in them is not a failing test but a workflow that cannot start at all. These
 * tests load both manifests and check the contract the runner script relies on:
 * every input the runner reads is declared and reaches it through the step's env.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function loadManifest(relativePath) {
  return yaml.load(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

const rootAction = loadManifest('action.yml');
const stagedGateAction = loadManifest('actions/staged-gate/action.yml');

describe('the root action manifest', () => {
  it('is a composite action with exactly one step', () => {
    expect(rootAction.runs.using).toBe('composite');
    expect(rootAction.runs.steps).toHaveLength(1);
  });

  it('declares every input the run reads, including the prebuilt-bundle pair', () => {
    expect(Object.keys(rootAction.inputs)).toEqual([
      'token',
      'config',
      'project-root',
      'android',
      'ios',
      'bundle-dir',
      'emit-bundle-dir',
      'working-directory',
    ]);
  });

  it('passes each input to the runner as the env var the runner reads', () => {
    // The runner reads env, never argv, so a token is never a visible argument in
    // the log. That makes this mapping the whole input surface of the action.
    expect(rootAction.runs.steps[0].env).toEqual({
      SHERLO_TOKEN: '${{ inputs.token }}',
      SHERLO_CONFIG: '${{ inputs.config }}',
      SHERLO_PROJECT_ROOT: '${{ inputs.project-root }}',
      SHERLO_ANDROID: '${{ inputs.android }}',
      SHERLO_IOS: '${{ inputs.ios }}',
      SHERLO_BUNDLE_DIR: '${{ inputs.bundle-dir }}',
      SHERLO_EMIT_BUNDLE_DIR: '${{ inputs.emit-bundle-dir }}',
    });
  });

  it('publishes the outputs a workflow routes on', () => {
    expect(Object.keys(rootAction.outputs)).toEqual([
      'native-needed',
      'reason',
      'base-fingerprint',
      'url',
    ]);
  });
});

describe('the deprecated staged-gate action manifest', () => {
  it('still parses and still delegates to the same runner script', () => {
    expect(stagedGateAction.runs.using).toBe('composite');
    expect(stagedGateAction.runs.steps[0].run).toContain('lib/runSherloTest.mjs');
  });
});
