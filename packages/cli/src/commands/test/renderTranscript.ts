/**
 * `sherlo test --dry-run --render-transcript <scenario>` - THE EXPECTATION
 * PRODUCER, and the road half of the render-layer project (slice S0a).
 *
 * MINT CAPTURES FROM A WORLD; RENDER COMPUTES FROM A SCENARIO. There are already
 * five things called "mint" in these repos (`harness mint`, `expected-mint`, the
 * `mintedBy` sidecar guard, token minting, and `--emit-expectation`'s prose), so
 * this deliberately is not a sixth. It renders: it takes a scenario's scripted
 * wire state, runs the CLI's OWN dry-run code over it, and writes what that code
 * printed.
 *
 * WHAT IT SUBSTITUTES, AND WHAT IT DOES NOT. A dry run performs exactly three
 * effects - it bundles, it reads git, and it asks the server a read-only
 * question - and this supplies those three and nothing else. It does not stub a
 * formatter, a print site, a segment or a branch: {@link runDryRunFlow} is the
 * shipped function `stagedRun` itself calls, the bundling loop is the shipped
 * loop, `runDryRunPreview` is the shipped preview, and every literal comes from
 * the render layer. That is why a rendered transcript is evidence about the CLI
 * and not about this file.
 *
 * WHAT IT WRITES:
 *   - stdout: the transcript's stdout bytes, verbatim and unmasked. Masking is
 *     the tester's job, using the masker the CAPTURE uses - never a copy here.
 *   - stderr: a JSON envelope carrying the run's stderr transcript, the exit
 *     code, the command, and the ambient it actually applied. A CLI beat is
 *     three things (masked output, raw output, an exit code) and a producer that
 *     emits only bytes leaves the other two to be hand-declared.
 *
 * TWO PASSES, ALWAYS. The scenario is re-read and re-rendered from scratch and
 * the two results are compared. It proves determinism, not truth - a producer
 * agrees with itself by construction - but it is what catches a real-clock or
 * ambient leak, and it costs milliseconds. What proves TRUTH here is the ratchet:
 * every scenario must render byte-identically to a fixture a real device run
 * against the real backend produced.
 */
import { createHash } from 'crypto';
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import { degradeGitInfo, type GitInfo } from '../../helpers/getGitInfo';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import { runDryRunFlow, type BundlingEffects } from './bundleAndPreview';
import type { BundleResult } from './buildBundle';
import type { DryRunDecisionClient } from './dryRunDecision';
import {
  DRY_RUN_TRANSCRIPTS,
  type DryRunTranscriptState,
  type ScriptedBundle,
  type TranscriptScenario,
} from './dryRun.transcripts';

/** The git info a scenario that CAN read git reports. Fixed, never a wall-clock read. */
const SCRIPTED_GIT_INFO: GitInfo = {
  commitName: 'the commit this scenario was grounded on',
  commitHash: '0000000000000000000000000000000000000000',
  branchName: 'feature/scenario',
};

/** Placeholder ids the scripted decision query is asked under. Nothing renders them. */
const SCRIPTED_PROJECT_INDEX = 1;
const SCRIPTED_TEAM_ID = 'scenario-team';
const SCRIPTED_BASE_FINGERPRINT = 'scenario-base-fingerprint';

/** What the verb writes to stderr beside the transcript. */
type TranscriptEnvelope = {
  scenarioId: string;
  /** The committed fixture these bytes must equal once the shipped masker runs. */
  fixture: string;
  command: string;
  exitCode: number;
  capture: TranscriptScenario['capture'];
  ambient: TranscriptScenario['ambient'];
  stderr: string;
  sha256: string;
};

/**
 * Render the named scenario and write it out, or print the catalog (`list`).
 * Exits the process: 0 on success, 1 for an unknown scenario or a refusal.
 */
export async function runRenderTranscript(scenarioId: string): Promise<void> {
  if (scenarioId === 'list') {
    // Two halves, the same split every render writes: the human catalog on
    // stdout, and on stderr the machine one `tester expected-render` reads so it
    // never has to parse prose or keep its own copy of the fixture paths.
    console.log(formatTranscriptCatalog());
    process.stderr.write(`${JSON.stringify(transcriptCatalogIndex())}\n`);
    process.exit(0);
  }

  const scenario = DRY_RUN_TRANSCRIPTS[scenarioId];
  if (!scenario) {
    console.error(
      `REFUSING TO RENDER (unknown scenario): "${scenarioId}" is not in the transcript catalog.\n\n` +
        formatTranscriptCatalog()
    );
    process.exit(1);
  }

  const first = await renderScenarioTranscript(scenario);
  const second = await renderScenarioTranscript(scenario);

  if (sha256(first) !== sha256(second)) {
    console.error(
      `REFUSING TO RENDER (reproducibility): scenario '${scenarioId}' rendered differently on two ` +
        `passes (${sha256(first)} vs ${sha256(second)}).\n` +
        '  A fixture the producer cannot reproduce is not a fixture, it is a coin toss. Something ' +
        'on the render path is reading a clock, a counter, or the environment.'
    );
    process.exit(1);
  }

  const envelope: TranscriptEnvelope = {
    scenarioId,
    fixture: scenario.fixture,
    command: `sherlo test --dry-run --render-transcript ${scenarioId}`,
    // A dry run creates nothing and routes nothing; it always completes.
    exitCode: 0,
    capture: scenario.capture,
    ambient: scenario.ambient,
    stderr: first.stderr,
    sha256: sha256(first),
  };

  process.stdout.write(first.stdout);
  process.stderr.write(`${JSON.stringify(envelope)}\n`);
  process.exit(0);
}

/* ========================================================================== */

/**
 * One full render of a scenario. Exported because the byte-identity gate renders
 * the catalog in-process rather than by spawning the built CLI - the ratchet is
 * only useful if its inner loop costs milliseconds.
 */
export async function renderScenarioTranscript(
  scenario: TranscriptScenario
): Promise<CapturedTranscript> {
  const state = scenario.state;

  // The ambient the scenario DECLARES, applied to the read the shipped code
  // makes - so `printSherloIntro` takes its own real branch rather than being
  // bypassed. Never defaulted: the scenario type makes it mandatory. Restored
  // afterwards, because a caller that renders several scenarios in one process
  // (the gate does) must not have one scenario's ambient reach the next.
  const previousSkipIntro = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = scenario.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();

      await runDryRunFlow({
        projectRoot: '/Users/sherlo-user/my-app',
        platformsToTest: state.platformsToTest,
        client: scriptedDecisionClient(state),
        projectIndex: SCRIPTED_PROJECT_INDEX,
        teamId: SCRIPTED_TEAM_ID,
        baseFingerprint: SCRIPTED_BASE_FINGERPRINT,
        resolveGitInfo: async () =>
          state.gitInfoAvailable
            ? SCRIPTED_GIT_INFO
            : degradeGitInfo(
                new Error('fatal: not a git repository (or any of the parent directories): .git')
              ),
        effects: scriptedBundlingEffects(state),
      });
    });
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}

/**
 * The bundling effects a scenario scripts. `bundleFor` returns the REAL
 * {@link BundleResult} shape the bundler returns, so a scenario cannot describe a
 * bundle the bundler could not have produced; `gateMetadataFor` returns a marker
 * no transcript renders (a dry run computes gate metadata and discards it).
 */
function scriptedBundlingEffects(state: DryRunTranscriptState): BundlingEffects {
  return {
    bundleFor: async (_projectRoot, platform) => {
      const scripted = state.bundles[platform];
      if (!scripted) {
        throw new Error(
          `REFUSING TO RENDER (incomplete state): platform '${platform}' is under test but the ` +
            'scenario scripts no bundle for it.'
        );
      }
      return toBundleResult(scripted);
    },
    gateMetadataFor: async () => ({ derivation: 'none' } as unknown as GateMetadataInput),
  };
}

/** Widen a scripted bundle into the full {@link BundleResult} the CLI consumes. */
function toBundleResult(scripted: ScriptedBundle): BundleResult {
  const storyClosures: Record<string, unknown> = {};
  for (const key of scripted.storyClosureKeys ?? []) storyClosures[key] = {};

  return {
    bundlePath: scripted.bundlePath,
    bundleFormat: scripted.bundleFormat,
    bundleSizeMb: scripted.bundleSizeMb,
    bundleHash: 'scenario-bundle-hash',
    bundler: scripted.bundler,
    ...(scripted.assets ? { assetsDest: '/Users/sherlo-user/my-app/assets' } : {}),
    assetInventory: scripted.assets ?? [],
    ...(scripted.storyClosureKeys
      ? {
          moduleManifest: {
            raw: Buffer.from(JSON.stringify({ version: 1, storyClosures })),
            parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures },
          },
        }
      : {}),
  };
}

/**
 * The client the read-only decision query is issued through. `client` is already
 * a parameter of `runDryRunPreview`, so scripting the query adds NO new
 * substitution surface - and what it returns is {@link ComputeDiffScopeDryRunResult},
 * the contract-mirrored wire type, so a state the server could not shape does not
 * compile.
 */
function scriptedDecisionClient(state: DryRunTranscriptState): DryRunDecisionClient {
  return {
    computeDiffScopeDryRun: async () => {
      if (state.decision.outcome === 'threw') throw new Error(state.decision.message);
      return state.decision.result;
    },
  } as unknown as DryRunDecisionClient;
}

function sha256(transcript: CapturedTranscript): string {
  return createHash('sha256')
    .update(`${transcript.stdout} ${transcript.stderr}`)
    .digest('hex')
    .slice(0, 16);
}

/** The machine catalog: what every scenario answers for, and how it is captured. */
function transcriptCatalogIndex(): Record<string, { fixture: string; capture: string }> {
  const index: Record<string, { fixture: string; capture: string }> = {};
  for (const [id, scenario] of Object.entries(DRY_RUN_TRANSCRIPTS)) {
    index[id] = { fixture: scenario.fixture, capture: scenario.capture };
  }
  return index;
}

function formatTranscriptCatalog(): string {
  const lines = Object.entries(DRY_RUN_TRANSCRIPTS).map(
    ([id, scenario]) =>
      `  ${id}\n    ${scenario.description}\n    fixture: ${scenario.fixture}\n` +
      `    capture: ${scenario.capture}  grounded: ${scenario.groundedBy.kind}`
  );

  return ['Available --render-transcript scenarios:', '', ...lines].join('\n');
}

/**
 * The bytes the committed fixture is made of, for this scenario's declared
 * capture. `stdout+stderr` is a concatenation, not an interleave: the spec that
 * judges those fixtures reads the child's two pipes separately and joins them,
 * so a warn printed mid-run lands at the end of the file.
 */
export function transcriptForCapture(
  scenario: TranscriptScenario,
  transcript: CapturedTranscript
): string {
  return scenario.capture === 'stdout+stderr'
    ? transcript.stdout + transcript.stderr
    : transcript.stdout;
}
