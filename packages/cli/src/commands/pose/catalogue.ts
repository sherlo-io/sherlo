/**
 * THE POSE CATALOGUE - every pose this repository commits, and the screen each one renders.
 *
 * A scenario is a FILE WITH A NAME under `packages/cli/poses/`, grouped by command. There is no
 * table of scenarios in code: adding one is adding a file, and the law
 * (./__tests__/catalogue.test.ts) picks it up on the next run.
 *
 * Beside every `<name>.pose.json` sits `<name>.txt` - the bytes the tool printed for it, committed
 * and reviewed like any other source. The law re-renders each pose and compares; a change to the
 * tool's wording therefore shows up as a diff in the pull request that made it, rather than as a
 * surprise to a user months later.
 *
 * ONE PLACE FINDS THE POSES AND ONE PLACE RENDERS THEM, so the law and the re-mint can never
 * disagree about which files are in the catalogue or about how a screen is produced.
 */
import fs from 'fs';
import path from 'path';
import { runPose } from './pose';
import { formatRefusals } from './pose';
import { readPoseDocument } from './readPose';

/** The catalogue's root, relative to this file's home in `src/commands/pose`. */
export const POSES_ROOT = path.join(__dirname, '..', '..', '..', 'poses');

/** One pose in the catalogue: where it lives, and where its committed screen lives. */
export type CataloguedPose = {
  /** `test/refusal-token-malformed` - the pose's name, as a reader says it. */
  name: string;
  posePath: string;
  screenPath: string;
};

/** Every pose under `poses/`, in a stable order so two runs list them the same way. */
export function catalogue(root: string = POSES_ROOT): CataloguedPose[] {
  return findPoseFiles(root)
    .sort()
    .map((posePath) => ({
      name: path.relative(root, posePath).replace(/\.pose\.json$/, ''),
      posePath,
      screenPath: posePath.replace(/\.pose\.json$/, '.txt'),
    }));
}

/**
 * The bytes one pose renders: the whole screen, then the exit code on a line of its own.
 *
 * THE EXIT CODE IS PART OF THE COMMITTED BYTES. A screen that stayed the same while its exit code
 * changed from 0 to 1 is a product change of exactly the kind a CI notices and a reader does not,
 * so it is written where a reader cannot miss it rather than kept in a second file.
 */
export async function renderPose(posePath: string): Promise<string> {
  const { screen, exitCode, refusals } = await runPose(
    readPoseDocument(fs.readFileSync(posePath, 'utf8'))
  );

  const refusalBlock = refusals.length > 0 ? formatRefusals(refusals) : '';

  return `${screen}${refusalBlock}\n[exit ${refusals.length > 0 ? 1 : exitCode}]\n`;
}

/* ========================================================================== */

function findPoseFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findPoseFiles(entryPath);
    return entry.name.endsWith('.pose.json') ? [entryPath] : [];
  });
}
