/**
 * WHAT blankSecrets REPLACES, AND WHAT IT LEAVES ALONE.
 */
import { describe, expect, it } from 'vitest';
import { GITHUB_SESSION_PREFIX } from '../../constants';
import { blankReportAndErrorLines, blankSecrets, BLANKED } from '../blankSecrets';

function sampleKey(prefix: string, length: number, letter = 'a'): string {
  return prefix + letter.repeat(length);
}

describe('anything shaped like a token or a key is blanked out before it leaves', () => {
  it('blanks a Sherlo token, a bearer token and the common API keys', () => {
    const shapes = [
      sampleKey('sht_', 24),
      sampleKey('Bearer ', 16, 'b'),
      sampleKey('sk-', 22),
      sampleKey('ghp_', 22),
      sampleKey('xoxb-', 16, '1'),
      sampleKey('AKIA', 16, 'A'),
      `${'a'.repeat(32)}k3j9x2ab4`,
    ];

    for (const shape of shapes) {
      expect(blankSecrets(`before ${shape} after`)).toBe(`before ${BLANKED} after`);
    }
  });

  it('blanks a GitHub session, including the web token it carries', () => {
    const session = `${GITHUB_SESSION_PREFIX}eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmNkZWZnaCJ9.c2lnbmF0dXJlMTIz`;

    expect(blankSecrets(`before ${session} after`)).toBe(`before ${BLANKED} after`);
  });

  it('blanks the report and the last command error lines, and leaves the rest of the context', () => {
    const context = {
      cliVersion: '1.0.0',
      operatingSystem: 'Darwin 25.5.0',
      lastCommand: {
        command: 'test',
        exitCode: 1,
        errorLines: [`401 with ${sampleKey('Bearer ', 16, 'b')}`, 'plain line'],
      },
    };

    const blanked = blankReportAndErrorLines(`key ${sampleKey('sk-', 22)}`, context);

    expect(blanked.report).toBe(`key ${BLANKED}`);
    expect(blanked.context.lastCommand?.errorLines).toEqual([`401 with ${BLANKED}`, 'plain line']);
    expect(blanked.context.cliVersion).toBe('1.0.0');
  });

  it('leaves ordinary words, commands and short identifiers as they are', () => {
    const ordinary = 'npx sherlo test --projectRoot ./app crashed with exit 1 at step 3';

    expect(blankSecrets(ordinary)).toBe(ordinary);
  });
});
