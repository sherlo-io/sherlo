/**
 * THE AGENT SKILL, for a team with agent skills on: the sherlo-tests guide in `.agents/skills` and
 * `.claude/skills`, and the marked line pointing at it in AGENTS.md (made when missing) and in
 * CLAUDE.md (when the app has one that does not import AGENTS.md). The writing is dev's own
 * (../skill); this step only says what happened, in one step line.
 *
 * Agent skills off: nothing is written. A run that changed no byte of those files reads
 * "(already done)".
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { renderAgentSkillLine } from '../../../render/initSteps';
import { pointerFor } from '../../../seams/shippedSkill';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import skill, { SKILL_FOLDERS } from '../skill/skill';

const POINTER_FILES = ['AGENTS.md', 'CLAUDE.md'];

function readIfThere(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

async function agentSkill(): Promise<void> {
  if (workstation().agentSkillsFlag() !== 'on') return;

  const projectRoot = getCwd();
  const files = [...SKILL_FOLDERS.map((folder) => path.join(folder, 'SKILL.md')), ...POINTER_FILES];
  const before = files.map((file) => readIfThere(path.join(projectRoot, file)));
  await skill();
  const after = files.map((file) => readIfThere(path.join(projectRoot, file)));

  const pointer = pointerFor(workstation().scenesFlag() === 'on');
  const pointerFiles = POINTER_FILES.filter((file) =>
    after[files.indexOf(file)]?.includes(pointer)
  );
  const changed = files.some((_, index) => before[index] !== after[index]);
  printLines([renderAgentSkillLine({ outcome: changed ? 'done' : 'already', pointerFiles })]);
}

export default agentSkill;
