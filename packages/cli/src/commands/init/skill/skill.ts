import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { pointerFor, shippedSkillText } from '../../../seams/shippedSkill';
import { workstation } from '../../../seams/workstation';

/** Where the guide is written: `.agents/skills` reaches most coding agents, `.claude/skills` Claude Code. */
export const SKILL_FOLDERS = ['.agents/skills/sherlo-tests', '.claude/skills/sherlo-tests'];
export const POINTER_FILES = ['AGENTS.md', 'CLAUDE.md'];
export const SECTION_START = '<!-- sherlo-tests:start -->';
const SECTION_END = '<!-- sherlo-tests:end -->';
// CLAUDE.md that imports AGENTS.md already reads the section there: the import is a line of its
// own, so a mention of the file in a sentence is not one.
const IMPORTS_AGENTS_FILE = /^@AGENTS\.md[ \t]*$/m;

/**
 * The file's text with this app folder's pointer in the marked section, added at the end when there
 * is none. ONE LINE PER APP FOLDER SET UP: in a monorepo a second app's run keeps the first app's
 * line, so an agent working on either app is sent to its own folder. This folder's line, with
 * scenes on or off, is replaced where it stands; a rerun in the same folder changes no byte.
 */
function withMarkedSection(existing: string, pointer: string, appFolder: string): string {
  const start = existing.indexOf(SECTION_START);
  const end = existing.indexOf(SECTION_END);
  if (!(start >= 0 && end > start)) {
    const section = `${SECTION_START}\n${pointer}\n${SECTION_END}`;
    return existing === '' ? `${section}\n` : `${existing.replace(/\n*$/, '\n\n')}${section}\n`;
  }
  const thisFolderLines = [pointerFor(true, appFolder), pointerFor(false, appFolder)];
  const lines = existing
    .slice(start + SECTION_START.length, end)
    .split('\n')
    .filter((line) => line.trim() !== '');
  const at = lines.findIndex((line) => thisFolderLines.includes(line));
  const kept =
    at >= 0 ? lines.map((line, index) => (index === at ? pointer : line)) : [...lines, pointer];
  const section = `${SECTION_START}\n${kept.join('\n')}\n${SECTION_END}`;
  return existing.slice(0, start) + section + existing.slice(end + SECTION_END.length);
}

/**
 * Leaves the person's coding agent the Sherlo guide, with scenes only when the team has them on: the
 * same file in both skill folders, and a marked section pointing at it in AGENTS.md (made when
 * missing) and in CLAUDE.md when it exists and does not import AGENTS.md. A second run replaces the
 * guide and its own app folder's line between the markers only. It prints nothing.
 *
 * AT THE REPOSITORY'S ROOT, where the GitHub workflow goes: a coding agent started there finds no
 * guide in an app's subfolder (Codex looks for skills only from where it starts up to the root, and
 * Claude Code loads a subfolder's skills only once it touches files there). The guide's commands run
 * in the app's folder, where sherlo.config.json is, so in a subfolder the pointer names it.
 */
async function skill(repositoryRoot: string): Promise<void> {
  const scenesAreOn = workstation().scenesFlag() === 'on';
  const appFolder = path.relative(repositoryRoot, getCwd());
  const pointer = pointerFor(scenesAreOn, appFolder);

  for (const folder of SKILL_FOLDERS) {
    const file = path.join(repositoryRoot, folder, 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, shippedSkillText(scenesAreOn));
  }

  const agentsFile = path.join(repositoryRoot, 'AGENTS.md');
  const agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
  fs.writeFileSync(agentsFile, withMarkedSection(agents, pointer, appFolder));

  const claudeFile = path.join(repositoryRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeFile)) return;
  const claude = fs.readFileSync(claudeFile, 'utf8');
  if (IMPORTS_AGENTS_FILE.test(claude)) return;
  fs.writeFileSync(claudeFile, withMarkedSection(claude, pointer, appFolder));
}

export default skill;
