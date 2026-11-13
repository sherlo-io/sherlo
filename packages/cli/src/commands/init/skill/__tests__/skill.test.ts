/**
 * The setup step that leaves the coding agent its guide (../skill): the guide in both agent skill
 * folders, and one marked section pointing at it in AGENTS.md, and in CLAUDE.md when that file
 * stands on its own.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectFiles } from '../../../../seams/projectFiles';
import { pointerFor, shippedSkillText } from '../../../../seams/shippedSkill';
import skill from '../skill';

let scenesFlag: 'on' | 'off' | undefined;

vi.mock('../../../../seams/workstation', () => ({
  workstation: () => ({ scenesFlag: () => scenesFlag }),
}));

const SECTION_START = '<!-- sherlo-tests:start -->';

let root: string;
let putBackProjectFiles: () => void;

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function sectionsIn(file: string): number {
  return read(file).split(SECTION_START).length - 1;
}

describe('the skill setup writes', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-skill-'));
    putBackProjectFiles = installProjectFiles({ root: () => root });
    scenesFlag = 'off';
  });

  afterEach(() => {
    putBackProjectFiles();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('setup writes the guide to both agent skill folders and one marked section in AGENTS.md', async () => {
    scenesFlag = 'on';
    const write = vi.spyOn(process.stdout, 'write');

    await skill();

    for (const folder of ['.agents/skills/sherlo-tests', '.claude/skills/sherlo-tests']) {
      expect(read(`${folder}/SKILL.md`)).toBe(shippedSkillText(true));
    }
    expect(read('AGENTS.md')).toBe(
      `${SECTION_START}\n${pointerFor(true)}\n<!-- sherlo-tests:end -->\n`
    );
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('a second setup replaces its marked section and adds no second one', async () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Our agents\n\nKeep tests green.\n');

    await skill();
    scenesFlag = 'on';
    await skill();

    expect(sectionsIn('AGENTS.md')).toBe(1);
    expect(read('AGENTS.md')).toBe(
      `# Our agents\n\nKeep tests green.\n\n${SECTION_START}\n${pointerFor(true)}\n<!-- sherlo-tests:end -->\n`
    );
    expect(read('.claude/skills/sherlo-tests/SKILL.md')).toBe(shippedSkillText(true));
  });

  it('CLAUDE.md gets the section only when it exists and does not import AGENTS.md', async () => {
    await skill();
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);

    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    await skill();
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');

    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules\n');
    await skill();
    await skill();
    expect(sectionsIn('CLAUDE.md')).toBe(1);
    expect(read('CLAUDE.md')).toContain(pointerFor(false));
  });
});
