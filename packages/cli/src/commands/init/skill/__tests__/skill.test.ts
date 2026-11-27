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

    await skill(root);

    for (const folder of ['.agents/skills/sherlo-tests', '.claude/skills/sherlo-tests']) {
      expect(read(`${folder}/SKILL.md`)).toBe(shippedSkillText(true));
    }
    expect(read('AGENTS.md')).toBe(
      `${SECTION_START}\n${pointerFor(true, '')}\n<!-- sherlo-tests:end -->\n`
    );
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('a second setup replaces its marked section and adds no second one', async () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Our agents\n\nKeep tests green.\n');

    await skill(root);
    scenesFlag = 'on';
    await skill(root);

    expect(sectionsIn('AGENTS.md')).toBe(1);
    expect(read('AGENTS.md')).toBe(
      `# Our agents\n\nKeep tests green.\n\n${SECTION_START}\n${pointerFor(true, '')}\n<!-- sherlo-tests:end -->\n`
    );
    expect(read('.claude/skills/sherlo-tests/SKILL.md')).toBe(shippedSkillText(true));
  });

  it('CLAUDE.md gets the section only when it exists and has no line importing AGENTS.md', async () => {
    await skill(root);
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);

    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules\n\n@AGENTS.md\n');
    await skill(root);
    expect(read('CLAUDE.md')).toBe('# Rules\n\n@AGENTS.md\n');

    // A sentence naming the file imports nothing.
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules\n\nSee @AGENTS.md for more.\n');
    await skill(root);
    await skill(root);
    expect(sectionsIn('CLAUDE.md')).toBe(1);
    expect(read('CLAUDE.md')).toContain(pointerFor(false, ''));
  });

  it("in a monorepo the guide goes at the repository's root, and the pointer names the app's folder", async () => {
    const appFolder = path.join(root, 'apps', 'mobile');
    fs.mkdirSync(appFolder, { recursive: true });
    putBackProjectFiles();
    putBackProjectFiles = installProjectFiles({ root: () => appFolder });

    await skill(root);

    expect(read('.agents/skills/sherlo-tests/SKILL.md')).toBe(shippedSkillText(false));
    expect(read('AGENTS.md')).toContain(
      'use the sherlo-tests skill first, and run its commands in apps/mobile.'
    );
    expect(fs.existsSync(path.join(appFolder, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(appFolder, '.agents'))).toBe(false);
  });

  it("a second app's setup in a monorepo keeps the first app's line, and a rerun changes nothing", async () => {
    const setUpIn = async (app: string) => {
      putBackProjectFiles();
      putBackProjectFiles = installProjectFiles({ root: () => path.join(root, 'apps', app) });
      await skill(root);
    };
    const section = (...lines: string[]) =>
      `${SECTION_START}\n${lines.join('\n')}\n<!-- sherlo-tests:end -->\n`;

    await setUpIn('a');
    await setUpIn('b');
    expect(read('AGENTS.md')).toBe(
      section(pointerFor(false, 'apps/a'), pointerFor(false, 'apps/b'))
    );

    await setUpIn('b');
    expect(read('AGENTS.md')).toBe(
      section(pointerFor(false, 'apps/a'), pointerFor(false, 'apps/b'))
    );

    // A rerun whose team turned scenes on changes its own folder's line, where it stands.
    scenesFlag = 'on';
    await setUpIn('a');
    expect(read('AGENTS.md')).toBe(
      section(pointerFor(true, 'apps/a'), pointerFor(false, 'apps/b'))
    );
  });
});
