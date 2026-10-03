/**
 * THE CONTRACT LAW, for ./pose.contract.ts - what stops the contract from drifting away from
 * the code it describes.
 *
 * The contract is written out to primitives and string literals because a consumer COPIES it and
 * could not resolve an import (see its header). It is GENERATED from the seams' own types now, so
 * the hand-written copy that could go stale in silence is gone - but a generated file is only as
 * fresh as the last run of its generator, and a copy that was never regenerated still compiles and
 * still reads plausibly.
 *
 * So the contract is pinned HERE, by assignability rather than by review, straight to the types
 * the seams declare. These are type-level assertions with no runtime body: `tsc` either accepts
 * them or names the field that moved. This file is NOT part of the contract and is not copied
 * anywhere - it lives next to it so a reader who finds one finds the other, and it imports the CLI
 * freely because it never leaves this repository. `yarn check:pose-contract` catches the same drift
 * the other way round, by regenerating and diffing; between them there is no way to change a seam
 * type and leave the contract behind.
 *
 * ------------------------------------------------------------------------
 * EVERY PIN HERE IS EXACT - BOTH DIRECTIONS - AND THE PAIR IS THE POINT.
 *
 * The pose the CLI decodes and the pose the contract declares must be interchangeable, so each
 * must be assignable to the other: a field ADDED to the CLI's type reds the contract-to-CLI
 * direction (the contract does not require it), and a field added to the CONTRACT reds the
 * CLI-to-contract direction (the CLI's reader would refuse it as an unknown field). One
 * direction alone would let the contract drift the other way in silence.
 */
import type { CommandPose as CliCommandPose } from '../packages/cli/src/seams/commandPose';
import type { PosedBundle as CliPosedBundle } from '../packages/cli/src/seams/bundler';
import type { PosedCapture as CliPosedCapture } from '../packages/cli/src/seams/captureSocket';
import type { PosedLetterbox as CliPosedLetterbox } from '../packages/cli/src/seams/letterbox';
import type {
  PosedBinary as CliPosedBinary,
  PosedPush as CliPosedPush,
} from '../packages/cli/src/seams/nativeBuild';
import type { PosedFiles as CliPosedFiles } from '../packages/cli/src/seams/projectFiles';
import type {
  BuildStatusAnswer as CliBuildStatusAnswer,
  DiffScopeDryRunAnswer as CliDiffScopeDryRunAnswer,
  NextBuildInfoAnswer as CliNextBuildInfoAnswer,
  ScriptedCall as CliScriptedCall,
} from '../packages/cli/src/seams/serverCalls';
import type { PosedGit as CliPosedGit } from '../packages/cli/src/seams/surroundings';
import type { PosedWorkstation as CliPosedWorkstation } from '../packages/cli/src/seams/workstation';
import type { BuildStatus } from '../packages/cli/src/helpers/waitForBuildResult';
import type {
  BuildStatusAnswer,
  CommandPose,
  DiffScopeDryRunAnswer,
  NextBuildInfoAnswer,
  PosedBinary,
  PosedBundle,
  PosedCapture,
  PosedFiles,
  PosedGit,
  PosedLetterbox,
  PosedPush,
  PosedWorkstation,
  ScriptedCall,
} from './pose.contract';

/** `A` is assignable to `B`. Distributed off by the tuple, so unions stay whole. */
type IsAssignable<A, B> = [A] extends [B] ? true : false;

/** Fails to compile unless `T` is exactly `true` - the assertion itself. */
type Assert<T extends true> = T;

/* -------------------------------------------------------------------------- *
 * EXACT: the contract's pose IS the pose the CLI's reader decodes.            *
 * -------------------------------------------------------------------------- */

type PoseMatchesCli = Assert<IsAssignable<CommandPose, CliCommandPose>>;
type CliMatchesPose = Assert<IsAssignable<CliCommandPose, CommandPose>>;

/* -------------------------------------------------------------------------- *
 * EXACT, per seam. Implied by the pair above, and asserted anyway: these are   *
 * the assertions whose failure a reader can act on directly, because each      *
 * names the ONE type a consumer writing that part of a pose is describing -    *
 * and the ONE seam that answers it.                                            *
 * -------------------------------------------------------------------------- */

type PosedFilesMatchesCli = Assert<IsAssignable<PosedFiles, CliPosedFiles>>;
type CliMatchesPosedFiles = Assert<IsAssignable<CliPosedFiles, PosedFiles>>;

type PosedGitMatchesCli = Assert<IsAssignable<PosedGit, CliPosedGit>>;
type CliMatchesPosedGit = Assert<IsAssignable<CliPosedGit, PosedGit>>;

type ScriptedCallMatchesCli = Assert<IsAssignable<ScriptedCall, CliScriptedCall>>;
type CliMatchesScriptedCall = Assert<IsAssignable<CliScriptedCall, ScriptedCall>>;

type PosedBundleMatchesCli = Assert<IsAssignable<PosedBundle, CliPosedBundle>>;
type CliMatchesPosedBundle = Assert<IsAssignable<CliPosedBundle, PosedBundle>>;

type DryRunAnswerMatchesCli = Assert<IsAssignable<DiffScopeDryRunAnswer, CliDiffScopeDryRunAnswer>>;
type CliMatchesDryRunAnswer = Assert<IsAssignable<CliDiffScopeDryRunAnswer, DiffScopeDryRunAnswer>>;

type PosedPushMatchesCli = Assert<IsAssignable<PosedPush, CliPosedPush>>;
type CliMatchesPosedPush = Assert<IsAssignable<CliPosedPush, PosedPush>>;

type PosedBinaryMatchesCli = Assert<IsAssignable<PosedBinary, CliPosedBinary>>;
type CliMatchesPosedBinary = Assert<IsAssignable<CliPosedBinary, PosedBinary>>;

type PosedWorkstationMatchesCli = Assert<IsAssignable<PosedWorkstation, CliPosedWorkstation>>;
type CliMatchesPosedWorkstation = Assert<IsAssignable<CliPosedWorkstation, PosedWorkstation>>;

type PosedLetterboxMatchesCli = Assert<IsAssignable<PosedLetterbox, CliPosedLetterbox>>;
type CliMatchesPosedLetterbox = Assert<IsAssignable<CliPosedLetterbox, PosedLetterbox>>;

type PosedCaptureMatchesCli = Assert<IsAssignable<PosedCapture, CliPosedCapture>>;
type CliMatchesPosedCapture = Assert<IsAssignable<CliPosedCapture, PosedCapture>>;

type NextBuildInfoMatchesCli = Assert<IsAssignable<NextBuildInfoAnswer, CliNextBuildInfoAnswer>>;
type CliMatchesNextBuildInfo = Assert<IsAssignable<CliNextBuildInfoAnswer, NextBuildInfoAnswer>>;

/* -------------------------------------------------------------------------- *
 * EXACT: the build the contract poses IS the build the wire sends.            *
 *                                                                            *
 * The server seam does not re-type this one - it aliases the wire shape - so  *
 * the pair below pins the CONTRACT's written-out copy straight to the         *
 * `getBuildStatus` response the shipped query selects. A pose describing a    *
 * build the backend cannot send would let a product design be approved off a  *
 * state that can never occur.                                                 *
 * -------------------------------------------------------------------------- */

type PosedBuildMatchesWire = Assert<IsAssignable<BuildStatusAnswer, BuildStatus>>;
type WireMatchesPosedBuild = Assert<IsAssignable<BuildStatus, BuildStatusAnswer>>;
type CliBuildIsTheWire = Assert<IsAssignable<CliBuildStatusAnswer, BuildStatus>>;

/* -------------------------------------------------------------------------- *
 * The assertions above are types, and an unused type is not an error in every *
 * configuration. This makes them load-bearing at the VALUE level too, so no   *
 * lint setting can quietly delete the law by calling it dead code.            *
 * -------------------------------------------------------------------------- */

export const POSE_CONTRACT_LAWS: [
  PoseMatchesCli,
  CliMatchesPose,
  PosedFilesMatchesCli,
  CliMatchesPosedFiles,
  PosedGitMatchesCli,
  CliMatchesPosedGit,
  ScriptedCallMatchesCli,
  CliMatchesScriptedCall,
  PosedBundleMatchesCli,
  CliMatchesPosedBundle,
  DryRunAnswerMatchesCli,
  CliMatchesDryRunAnswer,
  PosedPushMatchesCli,
  CliMatchesPosedPush,
  PosedBinaryMatchesCli,
  CliMatchesPosedBinary,
  PosedWorkstationMatchesCli,
  CliMatchesPosedWorkstation,
  PosedLetterboxMatchesCli,
  CliMatchesPosedLetterbox,
  PosedCaptureMatchesCli,
  CliMatchesPosedCapture,
  NextBuildInfoMatchesCli,
  CliMatchesNextBuildInfo,
  PosedBuildMatchesWire,
  WireMatchesPosedBuild,
  CliBuildIsTheWire
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];
