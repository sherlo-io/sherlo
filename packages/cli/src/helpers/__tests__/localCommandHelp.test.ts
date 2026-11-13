/**
 * The help words of the local commands (../localCommandHelp): each flag is listed under the word a
 * person types, and `suggest` describes itself.
 */
import { describe, expect, it } from 'vitest';
import { LOCAL_COMMAND_OPTION_DEFINITION, SUGGEST_DESCRIPTION } from '../localCommandHelp';

describe('the help words of the local commands', () => {
  it('lists every flag under the word a person types', () => {
    for (const [key, [flags]] of Object.entries(LOCAL_COMMAND_OPTION_DEFINITION)) {
      expect(flags, key).toMatch(new RegExp(`^--${key}\\b`));
    }
  });

  it('describes suggest as ranking from source files and git history', () => {
    expect(SUGGEST_DESCRIPTION).toContain('Rank what to test next');
    expect(SUGGEST_DESCRIPTION).toContain('--facts <file>');
  });
});
