/**
 * THE VIEW POSE - `sherlo view`'s transcript state, declared by a caller instead
 * of named from the catalog.
 *
 * `--render-transcript <id>` renders a transcript the CLI ships a name for.
 * `--render-transcript-state <path|->` renders one the CALLER describes, and this
 * file is the boundary between the two: it turns an untrusted JSON document into
 * a {@link ViewTranscriptScenario} - the exact same value the catalog holds - so
 * everything downstream of here is the one road both flags travel.
 *
 * THE CATALOG IS AN INSTANCE OF THE POSE, NOT A PEER OF IT. A catalog scenario is
 * a pose plus three pieces of catalog metadata (`description`, `groundedBy`,
 * `capture`), and nothing else. That is not an observation, it is a gate:
 * __tests__/viewPose.test.ts renders every catalog scenario by id and by pose and
 * requires the two to be byte-identical, so a scenario the pose cannot express is
 * a red test rather than a discovery.
 *
 * ------------------------------------------------------------------------
 * WHY THE DECODER REFUSES INSTEAD OF COERCING.
 *
 * Every rejection below could have been a default. A missing `ambient` could
 * inherit the process's, an unknown key could be dropped, a string `"7"` could
 * become the number 7. Each of those would make a mistyped pose render
 * SUCCESSFULLY - and a caller reviewing that transcript would be reviewing a
 * state they did not ask for, with nothing on screen to say so. The render layer
 * already states the principle for ambient in particular: a declared input, never
 * a read, because a default that silently matches today is how expectations
 * drift. This file applies it to the whole document.
 *
 * The refusal names EVERY unmet field in one message rather than the first, so a
 * caller fixing a hand-written pose makes one pass over it instead of one pass
 * per typo.
 *
 * The pose type itself is written against the LIVE wire type
 * ({@link BuildStatusResponse}), so a pose that describes a build the backend
 * could not shape does not compile. The import-free copy a consumer keeps lives
 * at contracts/transcript.contract.ts, pinned to this type by the law beside it.
 */
import type { BuildStatusResponse } from '../../helpers/waitForBuildResult';
import type { ViewGrounding, ViewTranscriptScenario } from './view.transcripts';

/**
 * The whole of what one `sherlo view` run needed in order to print what it
 * printed. `api.getBuildStatus` carries the wire's own nullability: `null` is the
 * answer for a build index that does not exist, and is a state worth posing.
 */
export type ViewTranscriptPose = {
  family: 'view';
  buildIndex: number;
  showDetails: boolean;
  ambient: { skipIntro: boolean };
  api: { getBuildStatus: BuildStatusResponse['getBuildStatus'] };
};

/** How a posed transcript answers the catalog's provenance question. */
const POSED_GROUNDING: ViewGrounding = {
  kind: 'unratcheted-shipped',
  coveredBy:
    'nothing committed - a posed transcript is grounded by the caller who declared it, and is ' +
    'evidence about the CLI only insofar as the pose describes a state the backend can send',
};

/** What a posed transcript says it is, where a catalog scenario has prose. */
const POSED_DESCRIPTION =
  'A `sherlo view` transcript rendered from a caller-declared pose rather than from the ' +
  'shipped catalog.';

/**
 * The scenario a pose IS - the same value the catalog holds, with the three
 * catalog-only fields supplied here because a pose has no opinion about them:
 * `capture` is `stdout` for every `view` transcript (the command prints nothing
 * to stderr), and the other two are provenance the caller, not the pose, owns.
 */
export function viewScenarioOfPose(pose: ViewTranscriptPose): ViewTranscriptScenario | null {
  const build = pose.api.getBuildStatus;
  if (build === null) return null;

  return {
    description: POSED_DESCRIPTION,
    groundedBy: POSED_GROUNDING,
    capture: 'stdout',
    ambient: pose.ambient,
    buildIndex: pose.buildIndex,
    showDetails: pose.showDetails,
    build,
  };
}

/** The pose a catalog scenario IS, once its catalog metadata is set aside. */
export function poseOfViewScenario(scenario: ViewTranscriptScenario): ViewTranscriptPose {
  return {
    family: 'view',
    buildIndex: scenario.buildIndex,
    showDetails: scenario.showDetails,
    ambient: scenario.ambient,
    api: { getBuildStatus: scenario.build },
  };
}

/**
 * Read one pose out of a parsed JSON document, or throw naming every field that
 * made it un-renderable.
 */
export function decodeViewPose(document: unknown): ViewTranscriptPose {
  const refusals: string[] = [];
  POSE.check('', document, refusals);

  if (refusals.length > 0) {
    throw new Error(
      'REFUSING TO RENDER (unusable pose): the declared state is not one this CLI could have ' +
        'been in.\n' +
        refusals.map((refusal) => `  - ${refusal}`).join('\n') +
        '\n  Every field is required unless the wire itself makes it optional, and an unknown ' +
        'field is refused rather than ignored - see contracts/transcript.contract.ts.'
    );
  }

  return document as ViewTranscriptPose;
}

/* ========================================================================== */
/* THE SHAPE VOCABULARY                                                        */
/*                                                                             */
/* Small enough to read in one sitting, and declarative enough that the pose    */
/* schema below reads as the contract file does. Each checker appends           */
/* reader-facing sentences to `refusals` and never throws, so ONE pass over a   */
/* document collects every problem in it.                                       */
/* ========================================================================== */

type Checker = { check: (path: string, value: unknown, refusals: string[]) => void };

/** How a field is named in a refusal: `api.getBuildStatus.stories[0].name`. */
function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function primitive(what: string, holds: (value: unknown) => boolean): Checker {
  return {
    check: (path, value, refusals) => {
      if (!holds(value)) refusals.push(`\`${path}\` must be ${what}, got ${describe(value)}`);
    },
  };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : JSON.stringify(value);
}

const aString = primitive('a string', (value) => typeof value === 'string');
const aBoolean = primitive('a boolean', (value) => typeof value === 'boolean');
const aCount = primitive(
  'a whole number of 0 or more',
  (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0
);
const aBuildIndex = primitive(
  'a build index (a whole number of 1 or more)',
  (value) => typeof value === 'number' && Number.isInteger(value) && value >= 1
);
/** For a field whose shape is the backend's, not this CLI's - `runError`. */
const anything: Checker = { check: () => undefined };

function oneOf(allowed: readonly string[]): Checker {
  return primitive(
    `one of ${allowed.map((value) => `"${value}"`).join(', ')}`,
    (value) => typeof value === 'string' && allowed.includes(value)
  );
}

function orNull(checker: Checker): Checker {
  return {
    check: (path, value, refusals) => {
      if (value !== null) checker.check(path, value, refusals);
    },
  };
}

function arrayOf(checker: Checker): Checker {
  return {
    check: (path, value, refusals) => {
      if (!Array.isArray(value)) {
        refusals.push(`\`${path}\` must be an array, got ${describe(value)}`);
        return;
      }
      value.forEach((item, index) => checker.check(`${path}[${index}]`, item, refusals));
    },
  };
}

/**
 * An object with exactly these fields. A field marked optional may be absent -
 * because the WIRE may omit it - but a field this CLI does not know is refused by
 * name wherever it appears.
 */
function object(fields: Record<string, { optional?: true; of: Checker }>): Checker {
  return {
    check: (path, value, refusals) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        refusals.push(`\`${path || 'the pose'}\` must be an object, got ${describe(value)}`);
        return;
      }

      const record = value as Record<string, unknown>;

      for (const key of Object.keys(record)) {
        if (!(key in fields)) {
          refusals.push(`\`${join(path, key)}\` is not a field this CLI knows`);
        }
      }

      for (const [key, field] of Object.entries(fields)) {
        const present = record[key] !== undefined;
        if (!present) {
          if (!field.optional) refusals.push(`\`${join(path, key)}\` is required`);
          continue;
        }
        field.of.check(join(path, key), record[key], refusals);
      }
    },
  };
}

/* ========================================================================== */
/* THE POSE SCHEMA - the runtime twin of contracts/transcript.contract.ts.      */
/* ========================================================================== */

const BUILD_STATUS = object({
  runStatus: {
    of: oneOf(['canceled', 'error', 'finished', 'inProgress', 'queued', 'waiting']),
  },
  showsOnlyBranchChanges: { optional: true, of: aBoolean },
  status: { optional: true, of: oneOf(['approved', 'noChanges', 'reported', 'unreviewed']) },
  viewStatusesCount: {
    optional: true,
    of: object({
      approved: { of: aCount },
      noChanges: { of: aCount },
      reported: { of: aCount },
      unreviewed: { of: aCount },
    }),
  },
  runError: { optional: true, of: anything },
  diffScopeInfo: {
    optional: true,
    of: object({
      capturedSnapshotCount: { optional: true, of: aCount },
      inheritedSnapshotCount: { optional: true, of: aCount },
      platforms: {
        optional: true,
        of: object({
          android: { optional: true, of: object({ reason: { optional: true, of: aString } }) },
          ios: { optional: true, of: object({ reason: { optional: true, of: aString } }) },
        }),
      },
    }),
  },
  gitInfo: {
    optional: true,
    of: object({ branchName: { of: aString }, commitHash: { of: aString } }),
  },
  stories: {
    optional: true,
    of: arrayOf(
      object({
        name: { of: aString },
        // Deliberately any string: the wire sends story statuses this CLI has not
        // learned yet, and a pose must be able to say what the wire says.
        status: { of: aString },
        baseline: { of: orNull(object({ buildIndex: { of: aBuildIndex } })) },
        reason: { optional: true, of: aString },
        candidates: { optional: true, of: arrayOf(object({ buildIndex: { of: aBuildIndex } })) },
      })
    ),
  },
  diffScope: {
    optional: true,
    of: object({
      reason: { of: aString },
      captured: { of: arrayOf(aString) },
      inherited: { of: arrayOf(aString) },
      ancestorBuildIndex: { of: orNull(aBuildIndex) },
    }),
  },
});

const POSE = object({
  family: { of: oneOf(['view']) },
  buildIndex: { of: aBuildIndex },
  showDetails: { of: aBoolean },
  // REQUIRED, though the CLI has a default for it. See this file's header.
  ambient: { of: object({ skipIntro: { of: aBoolean } }) },
  api: { of: object({ getBuildStatus: { of: orNull(BUILD_STATUS) } }) },
});
