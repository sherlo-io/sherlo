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
