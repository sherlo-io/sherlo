/**
 * ONE ROAD (sherlo / Drawing for a plan).
 *
 * `sherlo pose` used to have three older siblings: `--render-transcript`, `--render-transcript-state`
 * and `--emit-expectation` on `sherlo test --dry-run`, each with its own scenario catalog, its own
 * decoder and its own render path. All three are gone - `sherlo pose <pose.json|->` is the one way
 * left to run a command against a declared world and print the screen it would put on a terminal.
 *
 * This file proves the removal is total, two ways: the files that implemented the three roads are
 * gone from disk, and nothing still live - no flag definition, no helper script, no committed doc -
 * spells a name that only ever meant one of them. A name found here would be exactly the kind of
 * thing that survives a deletion by accident: a stray import, a doc nobody updated, a test still
 * exercising a decoder that no longer has a command wired to it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

/** `packages/cli`, this file's package root. */
const CLI_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
/** The repository root - where `contracts/` and `scripts/` live, outside this package. */
const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');

/**
 * Every file the three older roads were implemented in. Deleted in the commit that made
 * `sherlo pose` the one road; this is the list that must never come back.
 */
const DELETED_CLI_FILES = [
  'src/commands/test/renderTranscript.ts',
  'src/commands/view/renderViewTranscript.ts',
  'src/commands/projectCreate/renderProjectCreateTranscript.ts',
  'src/commands/projectCreate/projectCreatePose.ts',
  'src/commands/projectList/projectListPose.ts',
  'src/commands/teamCreate/teamCreatePose.ts',
  'src/commands/teamList/teamListPose.ts',
  'src/commands/view/viewPose.ts',
  'src/commands/test/emitExpectation.ts',
  'src/commands/test/preflight.refusals.ts',
  'src/commands/view/view.transcripts.ts',
  'src/commands/test/dryRun.transcripts.ts',
  'src/commands/test/verdict.transcripts.ts',
  'src/commands/test/renderVerdictTranscript.ts',
];

/** The contract a caller used to copy to describe a transcript pose, and its law. Repo root, not this package. */
const DELETED_REPO_FILES = [
  'contracts/transcript.contract.ts',
  'contracts/transcript.contract.law.ts',
];

/**
 * Names that only ever meant one of the three deleted roads. Found alive anywhere below, each one
 * is proof a road survived its own deletion - a stray import, an unremoved doc line, a test still
 * exercising a decoder nothing calls any more.
 *
 * Deliberately specific rather than a bare `'transcript'` or `'pose'`: those words are shared with
 * the pose catalogue this file does not want to flag (`packages/cli/poses`, `commands/pose/*`,
 * `render/*Transcript*` capture helpers), so every entry here is a name that named ONLY a deleted
 * road.
 */
const BANNED_NAMES = [
  '--render-transcript-state',
  '--render-transcript',
  '--emit-expectation',
  'RENDER_TRANSCRIPT_OPTION',
  'RENDER_TRANSCRIPT_STATE_OPTION',
  'EMIT_EXPECTATION_OPTION',
  'renderScenarioTranscript',
  'renderViewScenarioTranscript',
  'renderViewPoseTranscript',
  'renderProjectCreatePoseTranscript',
  'renderVerdictScenarioTranscript',
  'VERDICT_TRANSCRIPTS',
  'VIEW_TRANSCRIPTS',
  'DRY_RUN_TRANSCRIPTS',
  'PREFLIGHT_REFUSALS',
  'decodeViewPose',
  'decodeProjectCreatePose',
  'decodeProjectListPose',
  'decodeTeamCreatePose',
  'decodeTeamListPose',
  'poseOfViewScenario',
  'plan transcript',
];

/** Every regular file under `root`, walked recursively, skipping the directories named in `skip`. */
function filesUnder(root: string, skip: string[] = ['node_modules', 'dist', '.git']): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (skip.includes(entry.name)) return [];
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath, skip) : [entryPath];
  });
}

/**
 * Every source and doc file worth checking: this package's own source (its own test files
 * included, so a leftover test that still imports a deleted decoder is caught too), its README,
 * and the repo-root script and contract files the old roads reached into.
 *
 * THIS FILE ITSELF IS EXCLUDED - it is the one place the banned names are SUPPOSED to appear,
 * since it has to spell them out in order to look for them.
 */
function filesToCheck(): string[] {
  const thisFile = path.resolve(__dirname, 'one-road.test.ts');

  return [
    ...filesUnder(path.join(CLI_ROOT, 'src')).filter((file) => file.endsWith('.ts')),
    path.join(CLI_ROOT, 'README.md'),
    path.join(REPO_ROOT, 'scripts', 'repo.mjs'),
  ].filter((file) => file !== thisFile && fs.existsSync(file));
}

/** Every `(file, name)` pair where `file` still spells one of `names`, relative to `REPO_ROOT`. */
function scanForBannedNames(files: string[], names: string[]): string[] {
  const offenders: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(REPO_ROOT, file);

    for (const name of names) {
      if (content.includes(name)) {
        offenders.push(`${relativePath} - still names "${name}"`);
      }
    }
  }

  return offenders;
}

describe('sherlo pose is the one road to a planned transcript', () => {
  it('none of the three deleted roads left a file behind', () => {
    const stillThere = [...DELETED_CLI_FILES.map((f) => path.join(CLI_ROOT, f))].filter((f) =>
      fs.existsSync(f)
    );

    expect(
      stillThere,
      'a file implementing one of the three deleted roads is still on disk'
    ).toEqual([]);
  });

  it('the contract a caller used to copy for the render-transcript-state road is gone, with its law', () => {
    const stillThere = DELETED_REPO_FILES.map((f) => path.join(REPO_ROOT, f)).filter((f) =>
      fs.existsSync(f)
    );

    expect(stillThere).toEqual([]);
  });

  it('no flag, script or document names a transcript road other than sherlo pose', () => {
    const offenders = scanForBannedNames(filesToCheck(), BANNED_NAMES);

    expect(
      offenders,
      'A DELETED TRANSCRIPT ROAD IS STILL NAMED SOMEWHERE. `sherlo pose` is the one road left to ' +
        'run a command against a declared world and print its screen; a name that only ever meant ' +
        'one of the three older roads (--render-transcript, --render-transcript-state, ' +
        '--emit-expectation and the decoders/catalogs behind them) should not appear in anything ' +
        'this repository ships. Delete the reference rather than leave it describing a road that ' +
        'no longer exists.'
    ).toEqual([]);
  });

  it('CONTROL: the scan rejects a planted offender (the comparison still rejects what it should)', () => {
    // Without this, a scan that silently walked zero files (a wrong root, an over-eager skip) or a
    // comparison that had degenerated into a no-op would report no offenders and look exactly as
    // clean as a real proof.
    //
    // `RENDER_TRANSCRIPT_OPTION` rather than `BANNED_NAMES[0]`: several banned names are
    // substrings of one another (`--render-transcript` sits inside `--render-transcript-state`),
    // so planting one of those would make the scan correctly report TWO offenders and this
    // assertion would need to know which. This name is not a substring of any other entry.
    const plantedName = 'RENDER_TRANSCRIPT_OPTION';
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-one-road-'));
    const scratchFile = path.join(scratchDir, 'planted.ts');
    fs.writeFileSync(scratchFile, `const dead = '${plantedName}';\n`);

    try {
      expect(scanForBannedNames([scratchFile], BANNED_NAMES)).toEqual([
        `${path.relative(REPO_ROOT, scratchFile)} - still names "${plantedName}"`,
      ]);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});
