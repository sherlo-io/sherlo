/**
 * THE CONTRACT LAW, for ./pose.contract.ts - what stops the contract from drifting away from
 * the code it describes.
 *
 * The contract is written out to primitives and string literals because a consumer COPIES it and
 * could not resolve an import (see its header). The price of writing a type out by hand is that
 * the hand-written copy can go stale in total silence: a field renamed in the CLI leaves a
 * contract that still compiles, still reads plausibly, and describes a pose the CLI will refuse.
 *
 * So the contract is pinned HERE instead, by assignability rather than by review. These are
 * type-level assertions with no runtime body: `tsc` either accepts them or names the field that
 * moved. This file is NOT part of the contract and is not copied anywhere - it lives next to it
 * so a reader who finds one finds the other, and it imports the CLI freely because it never
 * leaves this repository. It is the same law ./transcript.contract.law.ts keeps for the
 * transcript contract, written the same way for the same reason.
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
import type {
  BuildStatusAnswer as CliBuildStatusAnswer,
  CommandPose as CliCommandPose,
  DiffScopeDryRunAnswer as CliDiffScopeDryRunAnswer,
  NextBuildInfoAnswer as CliNextBuildInfoAnswer,
  PosedBinary as CliPosedBinary,
  PosedBundle as CliPosedBundle,
  PosedPush as CliPosedPush,
  PosedWorkstation as CliPosedWorkstation,
  ScriptedCall as CliScriptedCall,
} from '../packages/cli/src/commands/pose/readPose';
import type { BuildStatus } from '../packages/cli/src/helpers/waitForBuildResult';
import type {
  BuildStatusAnswer,
  CommandPose,
  DiffScopeDryRunAnswer,
  NextBuildInfoAnswer,
  PosedBinary,
  PosedBundle,
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
 * EXACT, per part. Implied by the pair above, and asserted anyway: these are   *
 * the assertions whose failure a reader can act on directly, because each      *
 * names the ONE type a consumer writing that part of a pose is describing.     *
 * -------------------------------------------------------------------------- */

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

type NextBuildInfoMatchesCli = Assert<IsAssignable<NextBuildInfoAnswer, CliNextBuildInfoAnswer>>;
type CliMatchesNextBuildInfo = Assert<IsAssignable<CliNextBuildInfoAnswer, NextBuildInfoAnswer>>;

/* -------------------------------------------------------------------------- *
 * EXACT: the build the contract poses IS the build the wire sends.            *
 *                                                                            *
 * The CLI does not re-type this one - its reader imports the wire shape - so  *
 * the pair below pins the CONTRACT's hand-written copy straight to the        *
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
];
