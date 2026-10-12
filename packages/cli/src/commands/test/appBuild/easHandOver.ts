/**
 * WILL EAS UPLOAD THE HAND-OVER FILE? - asked by EAS mode before it opens a run (epic
 * sherlo-test-builds-apps, operator decision 2026-10-11).
 *
 * `sherlo test` writes `.sherlo/data.json` just before it starts the EAS builds, and each build's
 * `eas-build-on-complete` script reads it on Expo's machine to learn which run it belongs to. A
 * project whose upload leaves the file out builds fine on EAS and then hands nothing to Sherlo: the
 * hook finds no hand-over file, and the run waits until its deadline. So the project is refused
 * up front instead, naming the cause and the fix.
 *
 * EAS PACKS THE PROJECT BY ITS OWN RULES (eas-cli, `vcs/local.ts` `Ignore` and
 * `vcs/clients/git.ts` `makeShallowCopyAsync`, read 2026-10-11):
 *   - with `cli.requireCommit` set in eas.json it uploads only committed files, and the hand-over
 *     file is never committed - it is written for one run, just before the builds start;
 *   - otherwise, with an `.easignore` at the repository's root it applies that file alone;
 *   - and without one it applies every `.gitignore` in the tree, each to the folder it sits in.
 *
 * PLAN-LAYER DEBT, NAMED: the pattern matching below covers the forms ignore files are written in -
 * comments, `!` negation, a leading or middle `/` anchoring the pattern, a trailing `/` for a folder,
 * `*`, `?` and `**`. The build task swaps it for the `ignore` package, the matcher EAS itself uses,
 * so Sherlo's answer and EAS's can never differ. Draft words, for the content department's review.
 */
import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DATA_FILENAME, SHERLO_TEMP_DIRECTORY } from '../../../constants';
import { throwError } from '../../../helpers';

/** The file EAS reads instead of every `.gitignore` when the repository has one at its root. */
const EAS_IGNORE_FILE = '.easignore';
const GIT_IGNORE_FILE = '.gitignore';

/** The hand-over file, as a path inside the project. */
const HAND_OVER_FILE = `${SHERLO_TEMP_DIRECTORY}/${SHERLO_TEMP_DATA_FILENAME}`;

/** Refuse EAS mode when the project EAS uploads would not carry `.sherlo/data.json`. */
export function refuseWhenEasLeavesTheHandOverOut(projectRoot: string): void {
  refuseWhenEasUploadsOnlyCommittedFiles(projectRoot);

  const repositoryRoot = repositoryRootOf(projectRoot);
  const handOverFromTheRoot = toPosix(path.relative(repositoryRoot, path.join(projectRoot, HAND_OVER_FILE)));

  const easIgnorePath = path.join(repositoryRoot, EAS_IGNORE_FILE);
  if (fs.existsSync(easIgnorePath)) {
    const line = lineThatIgnores(fs.readFileSync(easIgnorePath, 'utf8'), handOverFromTheRoot);
    if (line === undefined) return;

    throwError({
      message:
        `Can't build on EAS: EAS would leave ${HAND_OVER_FILE} out of the project it uploads.\n` +
        `Sherlo writes a data file there for each run, and ${EAS_IGNORE_FILE} leaves it out with the line "${line}".\n` +
        `Remove that line from ${EAS_IGNORE_FILE}.`,
    });
  }

  for (const gitIgnore of gitIgnoresAbove(repositoryRoot, handOverFromTheRoot)) {
    const line = lineThatIgnores(fs.readFileSync(path.join(repositoryRoot, gitIgnore.file), 'utf8'), gitIgnore.handOverFromHere);
    if (line === undefined) continue;

    throwError({
      message:
        `Can't build on EAS: EAS would leave ${HAND_OVER_FILE} out of the project it uploads.\n` +
        `Sherlo writes a data file there for each run, and ${gitIgnore.file} ignores it with the line "${line}".\n` +
        `EAS reads ${EAS_IGNORE_FILE} instead of ${GIT_IGNORE_FILE} when there is one. At the root of your git repository, copy ${GIT_IGNORE_FILE} to ${EAS_IGNORE_FILE}, then remove the line "${line}" from the copy.`,
    });
  }
}

/** `cli.requireCommit` makes EAS upload committed files only, and the hand-over file never is one. */
function refuseWhenEasUploadsOnlyCommittedFiles(projectRoot: string): void {
  let requireCommit: unknown;
  try {
    requireCommit = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8')).cli?.requireCommit;
  } catch {
    // No eas.json, or one that cannot be read: nothing requires a commit.
  }

  if (requireCommit !== true) return;

  throwError({
    message:
      'Can\'t build on EAS: eas.json sets "requireCommit": true, so EAS uploads only committed files.\n' +
      `Sherlo writes ${HAND_OVER_FILE} for each run just before the builds start, so it is never committed.\n` +
      'Remove "requireCommit" from the "cli" section of eas.json.',
  });
}

/** The folder EAS packs from: the git repository's root, or the project itself outside git. */
function repositoryRootOf(projectRoot: string): string {
  let folder = path.resolve(projectRoot);
  while (true) {
    if (fs.existsSync(path.join(folder, '.git'))) return folder;
    const parent = path.dirname(folder);
    if (parent === folder) return path.resolve(projectRoot);
    folder = parent;
  }
}

/**
 * Every `.gitignore` that can touch the hand-over file - the ones in the folders from the repository's
 * root down to `.sherlo/` itself - with the hand-over file's path as seen from each, root first.
 */
function gitIgnoresAbove(
  repositoryRoot: string,
  handOverFromTheRoot: string
): Array<{ file: string; handOverFromHere: string }> {
  const folders = handOverFromTheRoot.split('/').slice(0, -1);
  const found: Array<{ file: string; handOverFromHere: string }> = [];

  for (let depth = 0; depth <= folders.length; depth += 1) {
    const folder = folders.slice(0, depth).join('/');
    const file = folder === '' ? GIT_IGNORE_FILE : `${folder}/${GIT_IGNORE_FILE}`;
    if (!fs.existsSync(path.join(repositoryRoot, file))) continue;

    found.push({ file, handOverFromHere: folders.slice(depth).concat(SHERLO_TEMP_DATA_FILENAME).join('/') });
  }

  return found;
}

/**
 * The line of an ignore file that leaves `filePath` out, or undefined when none does.
 *
 * A folder the file sits in counts as the file: once a folder is ignored, nothing inside it can be
 * brought back. Within one path the last matching line decides, so a `!` line can bring it back.
 */
function lineThatIgnores(ignoreFile: string, filePath: string): string | undefined {
  const lines = ignoreFile
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '' && !line.startsWith('#'));

  const parts = filePath.split('/');
  for (let length = 1; length <= parts.length; length += 1) {
    const candidate = parts.slice(0, length).join('/');
    const isFolder = length < parts.length;

    let decidingLine: string | undefined;
    for (const line of lines) {
      const bringsBack = line.startsWith('!');
      if (!patternMatches(bringsBack ? line.slice(1) : line, candidate, isFolder)) continue;
      decidingLine = bringsBack ? undefined : line;
    }

    if (decidingLine !== undefined) return decidingLine;
  }

  return undefined;
}

/** Whether one ignore pattern matches one path, read the way git reads it. */
function patternMatches(pattern: string, candidate: string, isFolder: boolean): boolean {
  const onlyFolders = pattern.endsWith('/');
  if (onlyFolders && !isFolder) return false;

  const body = onlyFolders ? pattern.slice(0, -1) : pattern;
  const anchored = body.includes('/');
  const glob = body.startsWith('/') ? body.slice(1) : body;

  const expression = glob
    .split('/')
    .map((segment) => (segment === '**' ? '(?:.*)' : segmentToExpression(segment)))
    .join('/')
    .replace(/\(\?:\.\*\)\//g, '(?:.*/)?');

  return new RegExp(anchored ? `^${expression}$` : `^(?:.*/)?${expression}$`).test(candidate);
}

/** One path segment of a pattern: `*` is any run of characters but `/`, `?` is one of them. */
function segmentToExpression(segment: string): string {
  return segment
    .split('')
    .map((character) => {
      if (character === '*') return '[^/]*';
      if (character === '?') return '[^/]';
      return character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
