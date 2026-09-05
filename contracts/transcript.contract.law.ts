/**
 * THE CONTRACT LAW - what stops ./transcript.contract.ts from drifting away from
 * the code it describes.
 *
 * The contract is written out to primitives and string literals because a
 * consumer COPIES it and could not resolve an import (see its header). The price
 * of writing a type out by hand is that the hand-written copy can go stale in
 * total silence: a field renamed in the CLI leaves a contract that still
 * compiles, still reads plausibly, and describes a pose the CLI will refuse.
 *
 * So the contract is pinned HERE instead, by assignability rather than by review.
 * These are type-level assertions with no runtime body: `tsc` either accepts them
 * or names the field that moved. This file is NOT part of the contract and is not
 * copied anywhere - it lives next to it so a reader who finds one finds the
 * other, and it imports the CLI freely because it never leaves this repository.
 *
 * ------------------------------------------------------------------------
 * TWO KINDS OF PIN, AND THE DIFFERENCE IS DELIBERATE.
 *
 * EXACT (both directions) is for the shapes that are meant to be the same shape.
 * The pose the CLI decodes and the pose the contract declares must be
 * interchangeable, so each must be assignable to the other: a field ADDED to the
 * CLI's type reds the contract-to-CLI direction (the contract does not require
 * it), and a field added to the CONTRACT reds the CLI-to-contract direction (the
 * CLI would refuse it as unknown). One direction alone would let the contract
 * drift the other way in silence.
 *
 * ONE-WAY is for the places the contract deliberately says LESS than the code. A
 * catalog scenario is a pose plus three fields of catalog metadata
 * (`description`, `groundedBy`, `capture`), which no caller declaring a state
 * should have to invent - so the pose narrows, and only the pose-into-scenario
 * direction is asserted. Asserting the other direction would be asserting a
 * falsehood, and a law that has to be weakened to pass is not a law.
 */
import type { BuildStatus } from '../packages/cli/src/helpers/waitForBuildResult';
import type { ViewTranscriptScenario } from '../packages/cli/src/commands/view/view.transcripts';
import type { ViewTranscriptPose as CliViewTranscriptPose } from '../packages/cli/src/commands/view/viewPose';
import type { PosedBuildStatus, ViewTranscriptPose } from './transcript.contract';

/** `A` is assignable to `B`. Distributed off by the tuple, so unions stay whole. */
type IsAssignable<A, B> = [A] extends [B] ? true : false;

/** Fails to compile unless `T` is exactly `true` - the assertion itself. */
type Assert<T extends true> = T;

/* -------------------------------------------------------------------------- *
 * EXACT: the contract's pose IS the pose the CLI decodes.                     *
 * -------------------------------------------------------------------------- */

type PoseMatchesCli = Assert<IsAssignable<ViewTranscriptPose, CliViewTranscriptPose>>;
type CliMatchesPose = Assert<IsAssignable<CliViewTranscriptPose, ViewTranscriptPose>>;

/* -------------------------------------------------------------------------- *
 * EXACT: the build the contract poses IS the build the wire sends.            *
 *                                                                            *
 * Implied by the pair above, and asserted anyway: it is the assertion whose   *
 * failure a reader can act on directly, because it names the ONE type a       *
 * consumer writing a pose is actually describing.                             *
 * -------------------------------------------------------------------------- */

type PosedBuildMatchesWire = Assert<IsAssignable<PosedBuildStatus, BuildStatus>>;
type WireMatchesPosedBuild = Assert<IsAssignable<BuildStatus, PosedBuildStatus>>;

/* -------------------------------------------------------------------------- *
 * ONE-WAY: a pose supplies every piece of scenario state, and no metadata.    *
 *                                                                            *
 * The scenario fields a pose is responsible for, and the pose read as those   *
 * fields. Only pose -> scenario holds: a scenario's `build` is a build that   *
 * EXISTS, while a pose may state the read found none, so the reverse is       *
 * genuinely false and is not asserted.                                        *
 * -------------------------------------------------------------------------- */

type ScenarioState = Pick<
  ViewTranscriptScenario,
  'ambient' | 'build' | 'buildIndex' | 'showDetails'
>;

type PoseAsScenarioState = {
  ambient: ViewTranscriptPose['ambient'];
  build: NonNullable<ViewTranscriptPose['api']['getBuildStatus']>;
  buildIndex: ViewTranscriptPose['buildIndex'];
  showDetails: ViewTranscriptPose['showDetails'];
};

type PoseCoversScenarioState = Assert<IsAssignable<PoseAsScenarioState, ScenarioState>>;

/* -------------------------------------------------------------------------- *
 * The assertions above are types, and an unused type is not an error in every *
 * configuration. This makes them load-bearing at the VALUE level too, so no   *
 * lint setting can quietly delete the law by calling it dead code.            *
 * -------------------------------------------------------------------------- */

export const TRANSCRIPT_CONTRACT_LAWS: [
  PoseMatchesCli,
  CliMatchesPose,
  PosedBuildMatchesWire,
  WireMatchesPosedBuild,
  PoseCoversScenarioState
] = [true, true, true, true, true];
