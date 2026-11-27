/**
 * THE AGENT SKILL, for a team with agent skills on: the sherlo-tests guide in `.agents/skills` and
 * `.claude/skills`, and the marked line pointing at it in AGENTS.md (made when missing) and in
 * CLAUDE.md (when there is one that does not import AGENTS.md), all at the repository's root. The
 * writing is dev's own (../skill); this step only says what happened, in one step line.
 *
 * Agent skills off: nothing is written. A run that changed no byte of those files reads
 * "(already done)".
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { renderAgentSkillLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import skill, { POINTER_FILES, SECTION_START, SKILL_FOLDERS } from '../skill/skill';

function readIfThere(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

async function agentSkill(repositoryRoot: string): Promise<void> {
  if (workstation().agentSkillsFlag() !== 'on') return;

  const files = [...SKILL_FOLDERS.map((folder) => path.join(folder, 'SKILL.md')), ...POINTER_FILES];
  const before = files.map((file) => readIfThere(path.join(repositoryRoot, file)));
  await skill(repositoryRoot);
  const after = files.map((file) => readIfThere(path.join(repositoryRoot, file)));

  const fromAppFolder = (file: string) => path.relative(getCwd(), path.join(repositoryRoot, file));
  const pointerFiles = POINTER_FILES.flatMap((file) => {
    const index = files.indexOf(file);
    // A CLAUDE.md that imports AGENTS.md is left as it was, and points at the guide through it.
    if (!after[index]?.includes(SECTION_START)) return [];
    const change =
      before[index] === null ? 'created' : before[index] !== after[index] ? 'updated' : 'none';
    return [{ file: fromAppFolder(file), change } as const];
  });
  const changed = files.some((_, index) => before[index] !== after[index]);
  printLines([
    renderAgentSkillLine({
      outcome: changed ? 'done' : 'already',
      skillsFolders: SKILL_FOLDERS.map((folder) => fromAppFolder(path.dirname(folder))),
      pointerFiles,
    }),
  ]);
}

export default agentSkill;
