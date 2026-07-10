/**
 * Tests for the STAGED_GATE_REFUSAL wire-format parser + formatter (SHERLO-1707).
 *
 * The parser is PINNED to the exact format emitted by the openBuild resolver:
 *   STAGED_GATE_REFUSAL|<outcome>|<platform>|<comma-separated-diff>
 * Keep these expectations in lock-step with @sherlo/api-types StagedGateRefusal.
 */
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LINE,
  formatStagedGateRefusal,
  parseStagedGateRefusal,
  STAGED_GATE_REFUSAL_PREFIX,
} from '../stagedGateRefusal';

describe('parseStagedGateRefusal - exact wire format', () => {
  it('parses the canonical full-build-needed refusal with a multi-source diff', () => {
    // The exact example documented on the resolver.
    const error = {
      message: 'STAGED_GATE_REFUSAL|full-build-needed|android|engineClass,assetInventory',
    };

    const refusal = parseStagedGateRefusal(error);

    expect(refusal).toEqual({
      outcome: 'full-build-needed',
      platform: 'android',
      diff: ['engineClass', 'assetInventory'],
    });
  });

  it('parses a single-source diff', () => {
    const refusal = parseStagedGateRefusal({
      message: 'STAGED_GATE_REFUSAL|full-build-needed|ios|sdkProtocolVersion',
    });

    expect(refusal).toEqual({
      outcome: 'full-build-needed',
      platform: 'ios',
      diff: ['sdkProtocolVersion'],
    });
  });

  it('parses a not-stageable refusal with an empty diff (trailing pipe)', () => {
    const refusal = parseStagedGateRefusal({
      message: 'STAGED_GATE_REFUSAL|not-stageable|android|',
    });

    expect(refusal).toEqual({
      outcome: 'not-stageable',
      platform: 'android',
      diff: [],
    });
  });

  it('parses a not-stageable refusal with the diff field entirely absent', () => {
    const refusal = parseStagedGateRefusal({
      message: 'STAGED_GATE_REFUSAL|not-stageable|ios',
    });

    expect(refusal).toEqual({
      outcome: 'not-stageable',
      platform: 'ios',
      diff: [],
    });
  });

  it('accepts a raw string message (not just an Error-like object)', () => {
    const refusal = parseStagedGateRefusal(
      'STAGED_GATE_REFUSAL|full-build-needed|android|buildMetadata'
    );

    expect(refusal?.diff).toEqual(['buildMetadata']);
  });

  it('exposes the prefix constant used to detect a refusal', () => {
    expect(STAGED_GATE_REFUSAL_PREFIX).toBe('STAGED_GATE_REFUSAL');
  });

  it('returns null for a non-refusal error message', () => {
    expect(parseStagedGateRefusal({ message: 'snapshotsLimitIsExceeded' })).toBeNull();
    expect(parseStagedGateRefusal({ message: 'Something|else|with|pipes' })).toBeNull();
    expect(parseStagedGateRefusal(new Error('network error'))).toBeNull();
  });

  it('returns null for non-error-shaped inputs', () => {
    expect(parseStagedGateRefusal(undefined)).toBeNull();
    expect(parseStagedGateRefusal(null)).toBeNull();
    expect(parseStagedGateRefusal({})).toBeNull();
    expect(parseStagedGateRefusal(42)).toBeNull();
  });
});

describe('formatStagedGateRefusal - user-facing message', () => {
  it('names each diff source and appends the test:standard fallback line', () => {
    const message = formatStagedGateRefusal({
      outcome: 'full-build-needed',
      platform: 'android',
      diff: ['engineClass', 'assetInventory'],
    });

    // Named-diff refusal.
    expect(message).toContain('Android');
    expect(message).toContain('JS engine (Hermes/JSC)');
    expect(message).toContain('bundled assets');
    // test:standard fallback line.
    expect(message).toContain(FALLBACK_LINE);
    expect(message).toContain('test:standard');
  });

  it('omits the changed-sources line for a not-stageable refusal (empty diff)', () => {
    const message = formatStagedGateRefusal({
      outcome: 'not-stageable',
      platform: 'ios',
      diff: [],
    });

    expect(message).toContain('iOS');
    expect(message).not.toContain('Changed since the base build');
    expect(message).toContain('test:standard');
  });

  it('round-trips a parsed refusal into a formatted message', () => {
    const refusal = parseStagedGateRefusal({
      message: 'STAGED_GATE_REFUSAL|full-build-needed|android|engineClass,assetInventory',
    });
    expect(refusal).not.toBeNull();

    const message = formatStagedGateRefusal(refusal!);
    expect(message).toContain('JS engine (Hermes/JSC)');
    expect(message).toContain('bundled assets');
    expect(message).toContain('test:standard');
  });
});
