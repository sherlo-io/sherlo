import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { pointerFor, shippedSkillText } from '../../../seams/shippedSkill';
import { workstation } from '../../../seams/workstation';

/** Where the guide is written: `.agents/skills` reaches most coding agents, `.claude/skills` Claude Code. */
const SKILL_FOLDERS = ['.agents/skills/sherlo-tests', '.claude/skills/sherlo-tests'];
const SECTION_START = '<!-- sherlo-tests:start -->';
const SECTION_END = '<!-- sherlo-tests:end -->';

/** The file's text with the marked section put in: replaced when it is there, else added at the end. */
function withMarkedSection(existing: string, scenesAreOn: boolean): string {
  const section = `${SECTION_START}\n${pointerFor(scenesAreOn)}\n${SECTION_END}`;
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
 */
async function skill(): Promise<void> {
  const root = getCwd();
  const scenesAreOn = workstation().scenesFlag() === 'on';

  for (const folder of SKILL_FOLDERS) {
    const file = path.join(root, folder, 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, shippedSkillText(scenesAreOn));
  }

  const agentsFile = path.join(root, 'AGENTS.md');
  const agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
  fs.writeFileSync(agentsFile, withMarkedSection(agents, scenesAreOn));

  const claudeFile = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(claudeFile)) return;
  const claude = fs.readFileSync(claudeFile, 'utf8');
  if (claude.includes('@AGENTS.md')) return;
  fs.writeFileSync(claudeFile, withMarkedSection(claude, scenesAreOn));
}

export default skill;
