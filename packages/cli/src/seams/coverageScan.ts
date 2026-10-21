/**
 * THE COVERAGE SCAN SEAM - the one road `sherlo coverage` reads the app down.
 *
 *     live   - the app's own source files (which components exist, which files import them, which
 *              story files import which), and with `--props` the TypeScript types of the props
 *              and a walk over every story on the running app, over the bundler's line
 *              (`bundlerLine.ts`). The live half is not written yet, and says so.
 *     posed  - the pose's `coverage`: whether a bundler is up, whether an app is attached, and
 *              what the scan found.
 *
 * A SEAM OF ITS OWN, NOT THE CAPTURE SOCKET. A capture is one story's record; this is the whole
 * app read at once, and most of it needs no app at all.
 */
import type { CoverageFindings, CoverageProps } from '../render/coverage';

/** What the scan came back with. */
export type CoverageResult =
  /** `--props` asked, and no bundler is on the address at all. */
  | { kind: 'no-bundler' }
  /** `--props` asked, and a bundler is up with no Sherlo app attached to it. */
  | { kind: 'no-app' }
  | { kind: 'scanned'; findings: CoverageFindings };

/** Everything the tool asks of the app down this road, and nothing else. */
export type CoverageScan = {
  scan(params: { port: number; withProps: boolean }): Promise<CoverageResult>;
};

/** The shipped answer. Not written yet. */
export const liveCoverageScan: CoverageScan = {
  scan: async () => {
    throw new Error('coverageScan: the live scan is not written yet');
  },
};

let installed: CoverageScan = liveCoverageScan;

/** The coverage scan in force. */
export function coverageScan(): CoverageScan {
  return installed;
}

/** Install a coverage scan for the duration of one posed run; the returned function undoes it. */
export function installCoverageScan(next: CoverageScan): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed coverage scan                                                    */
/* ========================================================================== */

/**
 * What the scan found, as a pose states it.
 *
 * As with the capture socket, a pose never supplies the words the screen shows: it states the
 * findings, and the tool prints whatever it prints for them.
 */
export type PosedCoverage =
  /** No bundler on the address at all. */
  | 'no-bundler'
  /** A bundler is up, and no app carrying the SDK is attached to it. */
  | 'no-app'
  | {
      /** How many components the app has. */
      components: number;
      /** The components no story file imports directly, in any order: the command ranks them. */
      gaps: CoverageFindings['gaps'];
      /** What walking every story found. Stated only when the pose runs `--props`. */
      props?: CoverageProps;
    };

/**
 * The coverage scan a pose declares.
 *
 * A pose with no `coverage` running `sherlo coverage` is refused and RECORDED, the way the capture
 * socket records an unscripted ask: throwing would replace the screen the pose exists to show.
 */
export function posedCoverageScan(
  posed: PosedCoverage | undefined
): CoverageScan & { refusals(): { call: string; problem: string }[] } {
  const refusals: { call: string; problem: string }[] = [];

  function refuse(problem: string): CoverageResult {
    refusals.push({ call: 'scan', problem });
    return { kind: 'no-bundler' };
  }

  return {
    refusals: () => refusals,

    scan: async ({ withProps }) => {
      if (!posed) {
        return refuse(
          'the pose states no `coverage`, and the command asked - say what the scan found'
        );
      }

      if (typeof posed === 'string') {
        // Reading the files needs no app; only `--props` ever meets the refusal.
        if (!withProps) {
          return refuse(
            `\`coverage\` is \`${posed}\`, and a scan without --props never reaches the app`
          );
        }
        return { kind: posed };
      }

      if (withProps && !posed.props) {
        return refuse('the command asked for `--props`, and the pose states no `coverage.props`');
      }

      const { props, ...findings } = posed;
      return { kind: 'scanned', findings: { ...findings, ...(withProps && { props }) } };
    },
  };
}
