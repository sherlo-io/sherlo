/**
 * The guide `sherlo init` writes for the person's coding agent (../shippedSkill): one source holds
 * both versions, and a team with scenes off gets a guide with no word of scenes.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { shippedSkillText } from '../shippedSkill';

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'skill', 'SKILL.md'), 'utf8');
const ANY_MARKER = /<!-- \/?(scenes|stories) -->/;

/** The text of every block the source keeps between `<!-- name -->` and `<!-- /name -->`. */
function blocksOf(name: 'scenes' | 'stories'): string[] {
  const pattern = new RegExp(`^<!-- ${name} -->\\n([\\s\\S]*?)\\n<!-- /${name} -->$`, 'gm');
  return [...SOURCE.matchAll(pattern)].map((match) => match[1]!);
}

describe('the shipped skill guide', () => {
  it('with scenes off the guide carries no scene part and never says scene', () => {
    const text = shippedSkillText(false);

    expect(text).toMatch(/^---\nname: sherlo-tests\ndescription: /);
    expect(text).not.toMatch(/scene/i);
    expect(text).not.toMatch(ANY_MARKER);
    expect(blocksOf('stories').length).toBeGreaterThan(0);
    for (const block of blocksOf('stories')) expect(text).toContain(block);
    expect(text).toContain('npx sherlo capture --story <id>');
  });

  it('with scenes on the guide carries every scene part', () => {
    const text = shippedSkillText(true);

    expect(text).toMatch(/^---\nname: sherlo-tests\ndescription: /);
    expect(text).not.toMatch(ANY_MARKER);
    expect(blocksOf('scenes').length).toBeGreaterThan(0);
    for (const block of blocksOf('scenes')) expect(text).toContain(block);
    for (const block of blocksOf('stories')) expect(text).not.toContain(block);
    // Every block the source opens is closed, so no version swallows the rest of the guide.
    expect(SOURCE.match(/^<!-- (scenes|stories) -->$/gm)?.length).toBe(
      SOURCE.match(/^<!-- \/(scenes|stories) -->$/gm)?.length
    );
  });

  it("the scenes guide walks a signed-in scene through the app's own mocks, with a logged-in user", () => {
    const text = shippedSkillText(true);
    const walkthrough = text.slice(text.indexOf('### A screen behind a login'));
    const steps = [
      'Find where the app keeps its session.',
      'Give the logged-in user in `appMocks`.',
      'export const SIGNED_IN_USER',
      'export const appMocks = given(',
      'Capture the signed-in screen.',
      'npx sherlo capture --scene <id>',
    ].map((step) => walkthrough.indexOf(step));

    expect(text).toContain('### A screen behind a login');
    expect(steps).not.toContain(-1);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(shippedSkillText(false)).not.toContain('keeps its session');
  });
});
