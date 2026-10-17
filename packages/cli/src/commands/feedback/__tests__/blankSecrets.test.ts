/**
 * WHAT blankSecrets REPLACES, AND WHAT IT LEAVES ALONE.
 */
import { describe, expect, it } from 'vitest';
import { blankReportAndErrorLines, blankSecrets, BLANKED } from '../blankSecrets';

describe('anything shaped like a token or a key is blanked out before it leaves', () => {
  it('blanks a Sherlo token, a bearer token and the common API keys', () => {
    const shapes = [
      'sht_abcdefghijklmnopqrstuvwx',
      'Bearer abcdef0123456789',
      'sk-abcdefghijklmnopqrstuv',
      'ghp_abcdefghijklmnopqrstuv',
      'xoxb-1234567890-abcdef',
      'AKIAABCDEFGHIJKLMNOP',
      `${'a'.repeat(32)}k3j9x2ab4`,
    ];

    for (const shape of shapes) {
      expect(blankSecrets(`before ${shape} after`)).toBe(`before ${BLANKED} after`);
    }
  });

  it('blanks the report and the last command error lines, and leaves the rest of the context', () => {
    const context = {
      cliVersion: '1.0.0',
      operatingSystem: 'Darwin 25.5.0',
      lastCommand: {
        command: 'test',
        exitCode: 1,
        errorLines: ['401 with Bearer abcdef0123456789', 'plain line'],
      },
    };

    const blanked = blankReportAndErrorLines('key sk-abcdefghijklmnopqrstuv', context);

    expect(blanked.report).toBe(`key ${BLANKED}`);
    expect(blanked.context.lastCommand?.errorLines).toEqual([`401 with ${BLANKED}`, 'plain line']);
    expect(blanked.context.cliVersion).toBe('1.0.0');
  });

  it('leaves ordinary words, commands and short identifiers as they are', () => {
    const ordinary = 'npx sherlo test --projectRoot ./app crashed with exit 1 at step 3';

    expect(blankSecrets(ordinary)).toBe(ordinary);
  });
});
