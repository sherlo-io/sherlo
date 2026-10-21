/**
 * THE COVERAGE SCAN SEAM - the one road `sherlo coverage` reads the app down.
 *
 *     live   - the app's own source files, read from the project folder and handed to
 *              ../commands/coverage/componentGaps (which components exist, which files import
 *              them, which story files import which). With `--props` it would also read the
 *              TypeScript types of the props and what each story file sets; that half is not
 *              written yet, and says so.
 *     posed  - the pose's `coverage`: what the scan found.
 *
 * A SEAM OF ITS OWN, NOT THE CAPTURE SOCKET. A capture is one story's record; this is the whole
 * app read at once, and none of it needs a phone or a bundler.
 */
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import { componentGaps } from '../commands/coverage/componentGaps';
import type { CoverageFindings } from '../render/coverage';
import { projectFiles } from './projectFiles';

/** Everything the tool asks of the app's files down this road, and nothing else. */
export type CoverageScan = {
  scan(params: { withProps: boolean }): Promise<CoverageFindings>;
};

/** Folders that hold no source of the app. Dot folders are skipped by the glob itself. */
const NOT_THE_APP = ['**/node_modules/**', '**/build/**', '**/dist/**', '**/Pods/**'];

/** The shipped answer: read the app's source files from the project folder and list the gaps. */
export const liveCoverageScan: CoverageScan = {
  scan: async ({ withProps }) => {
    if (withProps) {
      throw new Error('coverageScan: the live `--props` scan is not written yet');
    }

    const root = projectFiles().root();
    const paths = await fg('**/*.{ts,tsx,js,jsx}', { cwd: root, ignore: NOT_THE_APP, dot: false });
    const files = paths.sort().map((file) => ({
      path: file,
      text: fs.readFileSync(path.join(root, file), 'utf8'),
    }));
    const tsconfigPath = path.join(root, 'tsconfig.json');
    const tsconfig = fs.existsSync(tsconfigPath)
      ? fs.readFileSync(tsconfigPath, 'utf8')
      : undefined;

    return componentGaps({ files, tsconfig });
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
