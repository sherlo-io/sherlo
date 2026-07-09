/**
 * Tests for buildStagedRunConfig - the per-platform staged run config
 * constructor that cements the sherlo-runner#94 contract.
 *
 * These assertions ARE the contract guard - the exact field names the
 * runner expects, the optional-key semantics for assetsUrl, and the
 * pass-through behaviour for every input.
 */
import { describe, expect, it } from 'vitest';
import { buildStagedRunConfig } from '../buildStagedRunConfig';

// ---------------------------------------------------------------------------
// Exact key set (sherlo-runner#94 contract)
// ---------------------------------------------------------------------------

describe('buildStagedRunConfig - key set', () => {
  it('returns exactly [url, baseReference, jsBundleUrl, bundleSizeMb] when assetsUrl is not provided', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
    });

    expect(Object.keys(config).sort()).toEqual([
      'baseReference',
      'bundleSizeMb',
      'jsBundleUrl',
      'url',
    ]);
  });

  it('includes assetsUrl when a string value is passed', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
      assetsUrl: 's3://bucket/assets.tar.gz',
    });

    expect(Object.keys(config).sort()).toEqual([
      'assetsUrl',
      'baseReference',
      'bundleSizeMb',
      'jsBundleUrl',
      'url',
    ]);
    expect(config.assetsUrl).toBe('s3://bucket/assets.tar.gz');
  });

  it('omits assetsUrl when undefined is explicitly passed', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
      assetsUrl: undefined,
    });

    expect(Object.keys(config).sort()).toEqual([
      'baseReference',
      'bundleSizeMb',
      'jsBundleUrl',
      'url',
    ]);
    // Also confirm the key is truly absent, not present as undefined.
    expect('assetsUrl' in config).toBe(false);
    expect(config.hasOwnProperty('assetsUrl')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// url is always the empty string (assigned server-side later)
// ---------------------------------------------------------------------------

describe('buildStagedRunConfig - url', () => {
  it('is always the empty string', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
    });

    expect(config.url).toBe('');
  });

  it('is empty string even when assetsUrl is provided', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
      assetsUrl: 's3://bucket/assets.tar.gz',
    });

    expect(config.url).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Pass-through fields
// ---------------------------------------------------------------------------

describe('buildStagedRunConfig - pass-through', () => {
  it('passes baseReference through verbatim', () => {
    const baseReference = 'abcdef1234567890abcdef1234567890abcdef12';

    const config = buildStagedRunConfig({
      baseReference,
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 2.5,
    });

    expect(config.baseReference).toBe(baseReference);
  });

  it('passes jsBundleUrl through verbatim', () => {
    const jsBundleUrl = 's3://custom-bucket/path/to/bundle.js';

    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl,
      bundleSizeMb: 2.5,
    });

    expect(config.jsBundleUrl).toBe(jsBundleUrl);
  });

  it('passes bundleSizeMb through verbatim', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 4.75,
    });

    expect(config.bundleSizeMb).toBe(4.75);
  });

  it('handles zero bundleSizeMb', () => {
    const config = buildStagedRunConfig({
      baseReference: 'abc123',
      jsBundleUrl: 's3://bucket/bundle.js',
      bundleSizeMb: 0,
    });

    expect(config.bundleSizeMb).toBe(0);
  });
});
