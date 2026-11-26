import { describe, expect, it } from 'vitest';
import typedInitCommand from '../typedInitCommand';

const typed = (...words: string[]) => typedInitCommand(['node', 'sherlo', 'init', ...words]);

describe('the setup command a refusal ends on', () => {
  it('is the bare command when no flag was typed', () => {
    expect(typed()).toBe('npx sherlo init');
  });

  it('repeats the team and the project as typed, in either spelling', () => {
    expect(typed('--project=k3j9x2ab/4', '--team', 'k3j9x2ab')).toBe(
      'npx sherlo init --team k3j9x2ab --project k3j9x2ab/4'
    );
  });

  it('quotes a value the shell would split', () => {
    expect(typed('--team', "Anna's team")).toBe(`npx sherlo init --team 'Anna'\\''s team'`);
  });
});
