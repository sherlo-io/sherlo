/**
 * THE COVERAGE SCAN SEAM - the one road `sherlo coverage` reads the app down.
 *
 *     live   - the app's own source files (which components exist, which files import them, which
 *              story files import which), and with `--props` the TypeScript types of the props
 *              and what each story file sets for its own component. The live half is not
 *              written yet, and says so.
 *     posed  - the pose's `coverage`: what the scan found.
 *
 * A SEAM OF ITS OWN, NOT THE CAPTURE SOCKET. A capture is one story's record; this is the whole
 * app read at once, and none of it needs a phone or a bundler.
 */
import type { CoverageFindings } from '../render/coverage';

/** Everything the tool asks of the app's files down this road, and nothing else. */
export type CoverageScan = {
  scan(params: { withProps: boolean }): Promise<CoverageFindings>;
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
export type PosedCoverage = {
  /** How many components the app has. */
  components: number;
  /** The components no story file imports directly, in any order: the command ranks them. */
  gaps: CoverageFindings['gaps'];
  /** What reading the story files found. Stated only when the pose runs `--props`. */
  props?: CoverageFindings['props'];
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

  function refuse(problem: string): CoverageFindings {
    refusals.push({ call: 'scan', problem });
    return { components: 0, gaps: [] };
  }

  return {
    refusals: () => refusals,

    scan: async ({ withProps }) => {
      if (!posed) {
        return refuse(
          'the pose states no `coverage`, and the command asked - say what the scan found'
        );
      }

      if (withProps && !posed.props) {
        return refuse('the command asked for `--props`, and the pose states no `coverage.props`');
      }

      const { props, ...findings } = posed;
      return { ...findings, ...(withProps && { props }) };
    },
  };
}
