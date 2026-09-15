/**
 * Security-critical parsing tests for getTokenParts.
 *
 * getTokenParts is pure positional string slicing: the first
 * PROJECT_API_TOKEN_LENGTH (32) chars are the apiToken, the next
 * TEAM_ID_LENGTH (8) chars are the teamId, and everything after is the
 * numeric projectIndex. A parsing bug here is cross-tenant data leakage, so we
 * assert two properties:
 *
 *  1. Valid tokens slice to the CORRECT apiToken / teamId / projectIndex.
 *  2. Truncated / malformed / boundary inputs FAIL CLOSED at the real
 *     downstream gate (isValidToken) - they never route to a valid-looking
 *     team/project. getTokenParts itself does not throw (it is pure slicing),
 *     so we assert the observable field values plus isValidToken's verdict
 *     rather than inventing a throw the code does not perform.
 *
 * The anti-mis-route property is also checked directly: appending garbage to a
 * valid token must NOT shift the apiToken/teamId windows onto different bytes.
 */
import { describe, expect, it } from 'vitest';
import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import { PERSONAL_TOKEN_PREFIX } from '../../constants';
import getTokenParts from '../getTokenParts';
import isValidToken from '../isValidToken';

// Distinct, single-char segments make any mis-slice visually obvious.
const API = 'A'.repeat(PROJECT_API_TOKEN_LENGTH); // 32 × 'A'
const TEAM = 'B'.repeat(TEAM_ID_LENGTH); //          8 × 'B'

function makeToken(apiToken: string, teamId: string, index: string): string {
  return `${apiToken}${teamId}${index}`;
}

// ---------------------------------------------------------------------------
// Valid tokens route to the correct parts
// ---------------------------------------------------------------------------

describe('getTokenParts - valid tokens route correctly', () => {
  const validCases: Array<{
    name: string;
    token: string;
    expected: { apiToken: string; teamId: string; projectIndex: number };
  }> = [
    {
      name: 'single-digit project index',
      token: makeToken(API, TEAM, '1'),
      expected: { apiToken: API, teamId: TEAM, projectIndex: 1 },
    },
    {
      name: 'multi-digit project index',
      token: makeToken(API, TEAM, '999'),
      expected: { apiToken: API, teamId: TEAM, projectIndex: 999 },
    },
    {
      name: 'real-world team id with underscore',
      token: makeToken('abcdefghijklmnopqrstuvwxyzABCDEF', 'qA7_qHJ4', '30'),
      expected: {
        apiToken: 'abcdefghijklmnopqrstuvwxyzABCDEF',
        teamId: 'qA7_qHJ4',
        projectIndex: 30,
      },
    },
    {
      name: 'team id with dash',
      token: makeToken('0123456789012345678901234567890X', 'Ab-Cd_Ef', '7'),
      expected: {
        apiToken: '0123456789012345678901234567890X',
        teamId: 'Ab-Cd_Ef',
        projectIndex: 7,
      },
    },
  ];

  for (const { name, token, expected } of validCases) {
    it(`slices ${name} into the exact expected parts`, () => {
      expect(getTokenParts(token)).toEqual(expected);
    });

    it(`accepts ${name} as a valid token (routable)`, () => {
      expect(isValidToken(token)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Malformed / truncated tokens fail closed
// ---------------------------------------------------------------------------

describe('getTokenParts - malformed tokens fail closed (no silent mis-route)', () => {
  const invalidCases: Array<{ name: string; token: string }> = [
    { name: 'empty string', token: '' },
    { name: 'truncated below apiToken length', token: 'A'.repeat(20) },
    { name: 'exactly apiToken length (no teamId, no index)', token: API },
    { name: 'apiToken + teamId but no project index', token: API + TEAM },
    { name: 'non-numeric project index', token: makeToken(API, TEAM, 'xyz') },
    { name: 'zero project index', token: makeToken(API, TEAM, '0') },
    { name: 'negative project index', token: makeToken(API, TEAM, '-5') },
    { name: 'decimal project index', token: makeToken(API, TEAM, '1.5') },
    { name: 'non-numeric extra-long garbage', token: 'A'.repeat(120) },
  ];

  for (const { name, token } of invalidCases) {
    it(`rejects ${name} at the isValidToken gate`, () => {
      expect(isValidToken(token)).toBe(false);
    });
  }

  it('empty string yields empty segments and a non-routable index (not NaN-accepted)', () => {
    const parts = getTokenParts('');
    expect(parts.apiToken).toBe('');
    expect(parts.teamId).toBe('');
    // Number('') === 0, which is < 1 and thus rejected by isValidToken.
    expect(parts.projectIndex).toBe(0);
    expect(isValidToken('')).toBe(false);
  });

  it('non-numeric project index parses to NaN and is never silently accepted', () => {
    const token = makeToken(API, TEAM, 'xyz');
    const parts = getTokenParts(token);
    expect(Number.isNaN(parts.projectIndex)).toBe(true);
    expect(isValidToken(token)).toBe(false);
  });

  it('missing project index leaves a valid apiToken/teamId but a zero (rejected) index', () => {
    const token = API + TEAM;
    const parts = getTokenParts(token);
    expect(parts.apiToken).toBe(API);
    expect(parts.teamId).toBe(TEAM);
    expect(parts.projectIndex).toBe(0);
    expect(isValidToken(token)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Anti-mis-route: extra input never shifts the apiToken / teamId windows
// ---------------------------------------------------------------------------

describe('getTokenParts - windows never shift onto foreign bytes', () => {
  const base = makeToken(API, TEAM, '7');

  it('truncation keeps the apiToken window anchored at byte 0', () => {
    // A short token can only ever expose a PREFIX of the apiToken window - it
    // can never surface another tenant's teamId bytes.
    const parts = getTokenParts('A'.repeat(20));
    expect(parts.apiToken).toBe('A'.repeat(20));
    expect(parts.teamId).toBe('');
  });

  it('appending garbage does not move the apiToken/teamId windows', () => {
    const withJunk = base + 'GARBAGE';
    const parts = getTokenParts(withJunk);

    // The teamId window stays fixed on bytes 32-40 - appended bytes only ever
    // corrupt the trailing projectIndex, never the tenant identity.
    expect(parts.apiToken).toBe(API);
    expect(parts.teamId).toBe(TEAM);
    expect(Number.isNaN(parts.projectIndex)).toBe(true);
    expect(isValidToken(withJunk)).toBe(false);
  });

  it('the teamId is always exactly bytes 32-40 of the input', () => {
    const parts = getTokenParts(base);
    expect(parts.teamId).toBe(
      base.slice(PROJECT_API_TOKEN_LENGTH, PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH)
    );
  });
});

// ---------------------------------------------------------------------------
// A PERSONAL token is refused, not sliced
// ---------------------------------------------------------------------------

/**
 * THIS IS THE CASE THAT MADE getTokenParts A LEGACY-ONLY BRANCH.
 *
 * A personal token is `sht_` plus 32 opaque characters, and it carries no team
 * and no project - both are resolved server-side from its owner. Fed to the
 * composite slicer it would not fail: it would SUCCEED, yielding eight
 * characters of somebody's random secret as a `teamId`, and the CLI would then
 * address a request to a team that does not exist. That is the exact class of
 * silent mis-route the rest of this file was written to rule out, so the shape
 * is refused by name at the top of the function instead.
 *
 * The refusal must also not echo the credential: it is live, and the CLI's
 * errors reach CI logs and crash reports.
 */
describe('getTokenParts - a personal token is refused rather than mis-sliced', () => {
  const PERSONAL = `${PERSONAL_TOKEN_PREFIX}${'x'.repeat(32)}`;

  it('throws instead of returning parts', () => {
    expect(() => getTokenParts(PERSONAL)).toThrow();
  });

  it('says which credential was given and which one is wanted', () => {
    expect(() => getTokenParts(PERSONAL)).toThrow(/personal token/i);
    expect(() => getTokenParts(PERSONAL)).toThrow(/project token/i);
  });

  it('never echoes the token it refused', () => {
    try {
      getTokenParts(PERSONAL);
      expect.unreachable('getTokenParts accepted a personal token');
    } catch (error) {
      expect((error as Error).message).not.toContain(PERSONAL);
      // Not even the random half of it.
      expect((error as Error).message).not.toContain('x'.repeat(32));
    }
  });

  it('is answered `false` by isValidToken WITHOUT reaching the parser', () => {
    // The boolean gate has to survive a personal token: it is called from
    // paths that expect a verdict, not an exception.
    expect(isValidToken(PERSONAL)).toBe(false);
  });

  it('refuses on the PREFIX alone, whatever follows it', () => {
    // Truncated, over-long, or shaped exactly like a composite token - the
    // prefix decides, because a token that CLAIMS to be personal must never be
    // parsed as if it were not.
    const composite = `${PERSONAL_TOKEN_PREFIX}${API}${TEAM}7`;

    expect(() => getTokenParts(`${PERSONAL_TOKEN_PREFIX}short`)).toThrow(/personal token/i);
    expect(() => getTokenParts(composite)).toThrow(/personal token/i);
    expect(isValidToken(composite)).toBe(false);
  });

  it('leaves a legacy token that merely CONTAINS the prefix alone', () => {
    // `sht_` is only meaningful at position 0. A composite token whose random
    // half happens to contain those four characters is an ordinary project
    // token and must keep working.
    const legacy = makeToken(`sht_${'A'.repeat(PROJECT_API_TOKEN_LENGTH - 4)}`, TEAM, '7');
    const contains = makeToken(`A${'B'.repeat(3)}sht_${'C'.repeat(24)}`, TEAM, '7');

    // The first one DOES start with the prefix, so it is refused - that is the
    // intended trade and it is worth seeing stated.
    expect(() => getTokenParts(legacy)).toThrow(/personal token/i);

    // The second one does not, and is parsed exactly as before.
    expect(getTokenParts(contains).teamId).toBe(TEAM);
    expect(isValidToken(contains)).toBe(true);
  });
});

describe('unchanged: the legacy parse is untouched by the new branch', () => {
  const base = makeToken(API, TEAM, '7');

  it('still slices an ordinary project token', () => {
    const parts = getTokenParts(base);
    expect(parts.teamId).toBe(
      base.slice(PROJECT_API_TOKEN_LENGTH, PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH)
    );
  });
});
