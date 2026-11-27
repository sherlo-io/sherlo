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

/** The file's text with the marked section put in: replaced when it is there, else added at the end. */
function withMarkedSection(existing: string, pointer: string): string {
  const section = `${SECTION_START}\n${pointer}\n${SECTION_END}`;
  const start = existing.indexOf(SECTION_START);
  const end = existing.indexOf(SECTION_END);
  if (start >= 0 && end > start) {
    return existing.slice(0, start) + section + existing.slice(end + SECTION_END.length);
  }
  return existing === '' ? `${section}\n` : `${existing.replace(/\n*$/, '\n\n')}${section}\n`;
}

/**
 * Leaves the person's coding agent the Sherlo guide, with scenes only when the team has them on: the
 * same file in both skill folders, and a marked section pointing at it in AGENTS.md (made when
 * missing) and in CLAUDE.md when it exists and does not import AGENTS.md. A second run replaces the
 * guide and the text between the markers only. It prints nothing.
 *
 * AT THE REPOSITORY'S ROOT, where the GitHub workflow goes: a coding agent started there finds no
 * guide in an app's subfolder (Codex looks for skills only from where it starts up to the root, and
 * Claude Code loads a subfolder's skills only once it touches files there). The guide's commands run
 * in the app's folder, where sherlo.config.json is, so in a subfolder the pointer names it.
 */
async function skill(repositoryRoot: string): Promise<void> {
  const scenesAreOn = workstation().scenesFlag() === 'on';
  const pointer = pointerFor(scenesAreOn, path.relative(repositoryRoot, getCwd()));

  for (const folder of SKILL_FOLDERS) {
    const file = path.join(repositoryRoot, folder, 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, shippedSkillText(scenesAreOn));
  }

  const agentsFile = path.join(repositoryRoot, 'AGENTS.md');
  const agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
  fs.writeFileSync(agentsFile, withMarkedSection(agents, pointer));

  const claudeFile = path.join(repositoryRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeFile)) return;
  const claude = fs.readFileSync(claudeFile, 'utf8');
  if (IMPORTS_AGENTS_FILE.test(claude)) return;
  fs.writeFileSync(claudeFile, withMarkedSection(claude, pointer));
}

export default skill;
