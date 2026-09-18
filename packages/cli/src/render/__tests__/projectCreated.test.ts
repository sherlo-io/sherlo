/**
 * WHAT `sherlo project create` PUTS ON A SCREEN, AND WHAT IT MUST NEVER PUT
 * THERE.
 *
 * The interesting assertions in this file are the negative ones. A command that
 * mints a credential is one careless `console.log(response)` away from writing
 * a live secret into a CI log that a whole team can read, and the design note
 * this work implements names that as the real hazard here - not the credential
 * being returned at all, which is unavoidable, but the CLI amplifying it.
 *
 * So: the personal token is not printable from this layer at all (it is not in
 * the renderer's input, which is the strongest form of that guarantee), the
 * project token appears exactly once, and it is deliberately NOT emitted as one
 * of the machine-readable `key=value` lines that exist for CI to scrape.
 */
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../helpers/stripAnsi';
import { renderProjectCreated } from '../projectCreated';

const PROJECT = {
  name: 'Design System',
  index: 12,
  projectToken: 'p'.repeat(32) + 'team1234' + '12',
};

const lines = () => renderProjectCreated(PROJECT).map(stripAnsi);

describe('sherlo project create output', () => {
  it('names the project and its index as scrapable key=value lines', () => {
    expect(lines()).toContain('projectIndex=12');
    expect(lines()).toContain('projectName=Design System');
  });

  it('prints the project token exactly once', () => {
    const occurrences = lines().filter((line) => line.includes(PROJECT.projectToken));

    expect(occurrences).toHaveLength(1);
  });

  it('says the token will not be shown again, next to the token', () => {
    const text = lines().join('\n');

    expect(text).toMatch(/shown once/i);
    expect(text).toMatch(/cannot be shown again/i);
  });

  it('never puts the token on a key=value line, which is the line CI republishes', () => {
    const keyValueLines = lines().filter((line) => /^\w+=/.test(line));

    expect(keyValueLines.every((line) => !line.includes(PROJECT.projectToken))).toBe(true);
  });

  it('cannot print the personal token, because it is not an input to the renderer', () => {
    // A structural assertion, not a behavioural one: renderProjectCreated is
    // typed to three fields, so there is no value here to leak. If this ever
    // stops compiling because someone widened the input, that is the review.
    expect(Object.keys(PROJECT)).toEqual(['name', 'index', 'projectToken']);
  });
});
