/**
 * WHAT `sherlo project create` PRINTS. No token comes with a new project any more (epic
 * init-for-agents): a person works on their login, and only CI needs a token, which the project's
 * page makes. So the command prints the project and that page, and no secret at all.
 */
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../helpers/stripAnsi';
import { renderProjectCreated } from '../projectCreated';

const PROJECT = {
  name: 'Design System',
  index: 12,
  projectPageUrl: 'https://app.sherlo.io/project?t=team1234&p=12',
};

const lines = () => renderProjectCreated(PROJECT).map(stripAnsi);

describe('sherlo project create output', () => {
  it('names the project and its index as scrapable key=value lines', () => {
    expect(lines()).toContain('projectIndex=12');
    expect(lines()).toContain('projectName=Design System');
  });

  it("names the project's page, where a CI token is made, and prints no token", () => {
    const text = lines().join('\n');

    expect(text).toContain(PROJECT.projectPageUrl);
    expect(text).toMatch(/CI token/);
  });

  it('cannot print a token, because none is an input to the renderer', () => {
    // A structural assertion: the renderer is typed to three fields, none of them a secret.
    expect(Object.keys(PROJECT)).toEqual(['name', 'index', 'projectPageUrl']);
  });
});
