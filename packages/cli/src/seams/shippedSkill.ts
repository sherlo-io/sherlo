/**
 * THE GUIDE SHIPPED WITH THE CLI for the person's coding agent: `skill/SKILL.md` of the package,
 * listed in the package's `files`. The bundle reads it from `dist/../skill`, and the CLI run from
 * source from `src/seams/../../skill`.
 *
 * The file holds both versions of the guide: lines between `<!-- scenes -->` and `<!-- /scenes -->`
 * are for a team with scenes on, lines between `<!-- stories -->` and `<!-- /stories -->` for a team
 * with scenes off. The version handed out keeps one of the two and no marker line.
 */
import fs from 'fs';
import path from 'path';

const BLOCK_MARKER = /^<!-- (\/?)(scenes|stories) -->$/;

/**
 * The line that sends the coding agent to the guide; it names scenes only for a team with them on.
 * `appFolder`: the app's folder from the repository's root, '' when the app is the root; the guide's
 * `npx sherlo` commands run there, so a monorepo's line names it.
 */
export function pointerFor(scenesAreOn: boolean, appFolder: string): string {
  const tests = scenesAreOn ? 'Sherlo stories or scenes' : 'Sherlo stories';
  const where =
    appFolder === '' ? '' : `, and run its commands in ${appFolder.split(path.sep).join('/')}`;
  return `For finding untested screens or writing ${tests}, use the sherlo-tests skill first${where}.`;
}

/** The shipped guide for a team with scenes on or off. */
export function shippedSkillText(scenesAreOn: boolean): string {
  const besideBundle = path.join(__dirname, '..', 'skill', 'SKILL.md');
  const fromSource = path.join(__dirname, '..', '..', 'skill', 'SKILL.md');
  const source = fs.readFileSync(fs.existsSync(besideBundle) ? besideBundle : fromSource, 'utf8');

  const kept: string[] = [];
  let block: 'scenes' | 'stories' | null = null;
  for (const line of source.split('\n')) {
    const marker = BLOCK_MARKER.exec(line.trim());
    if (marker) {
      block = marker[1] ? null : (marker[2] as 'scenes' | 'stories');
      continue;
    }
    if (block === (scenesAreOn ? 'stories' : 'scenes')) continue;
    kept.push(line);
  }
  return kept.join('\n');
}
