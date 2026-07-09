/**
 * Tests for gateMetadata - HBC magic detection (Finding 2), bundle format sniff,
 * expo-updates plist parsing (Finding 4), and engine class config derivation.
 *
 * Finding 2: HBC magic byte order must be little-endian so Hermes bundles
 * are correctly classified as bundleFormat 'hbc'.
 *
 * Finding 4: iOS expo-updates detection must parse the VALUE of
 * EXUpdatesEnabled, not just check for key presence.
 */
import { beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a buffer that starts with the given bytes, padded to N bytes. */
function headerWith(prefix: number[], totalLen = 16): Buffer {
  const buf = Buffer.alloc(totalLen);
  for (let i = 0; i < prefix.length; i++) {
    buf[i] = prefix[i];
  }
  return buf;
}

// ---------------------------------------------------------------------------
// HBC_MAGIC byte order (Finding 2)
// ---------------------------------------------------------------------------

describe('HBC_MAGIC', () => {
  let HBC_MAGIC: Buffer;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    HBC_MAGIC = mod.HBC_MAGIC;
  });

  it('has the correct little-endian byte order for Hermes bytecode', () => {
    // Hermes writes 0x1F1903C103BC1FC6 in LITTLE-endian.
    // On-disk bytes: c6 1f bc 03 c1 03 19 1f
    const expected = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]);
    expect(HBC_MAGIC).toEqual(expected);
  });

  it('is exactly 8 bytes (the Hermes magic length)', () => {
    expect(HBC_MAGIC.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Bundle format sniff via HBC magic comparison (Finding 2 + renamed to bundleFormat)
// ---------------------------------------------------------------------------

describe('bundle format sniff (HBC magic detection)', () => {
  let HBC_MAGIC: Buffer;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    HBC_MAGIC = mod.HBC_MAGIC;
  });

  it('detects hbc when header starts with HBC magic bytes', () => {
    const hermesHeader = headerWith(Array.from(HBC_MAGIC)); // c6 1f bc 03 c1 03 19 1f ...
    const isHbc = hermesHeader.length >= 8 && hermesHeader.subarray(0, 8).equals(HBC_MAGIC);
    expect(isHbc).toBe(true);
  });

  it('detects plain-js when header starts with plain JS text', () => {
    // A typical RN bundle starts with `var __BUNDLE_START_TIME__=...`
    const jsHeader = Buffer.from('var __BUNDLE_START_TIME__=Date.now()', 'utf8');
    const isHbc = jsHeader.length >= 8 && jsHeader.subarray(0, 8).equals(HBC_MAGIC);
    expect(isHbc).toBe(false);
  });

  it('detects plain-js when header starts with "__d(" (metro module fn)', () => {
    // Another common RN bundle start pattern
    const jsHeader = Buffer.from('__d(function(', 'utf8');
    const isHbc = jsHeader.length >= 8 && jsHeader.subarray(0, 8).equals(HBC_MAGIC);
    expect(isHbc).toBe(false);
  });

  it('returns false for an empty buffer (too short)', () => {
    const short = Buffer.alloc(4);
    const isHbc = short.length >= 8 && short.subarray(0, 8).equals(HBC_MAGIC);
    expect(isHbc).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RAM bundle content detection
// ---------------------------------------------------------------------------

describe('checkRamBundle', () => {
  let checkRamBundle: (params: {
    binaryPath: string;
    bundlePath: string;
    fileName: string;
    projectRoot: string;
  }) => Promise<boolean>;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    checkRamBundle = mod.checkRamBundle;
  });

  it('is exported as a named function', () => {
    expect(typeof checkRamBundle).toBe('function');
  });

  it('does not throw for a nonexistent binary (fail-soft)', async () => {
    const result = await checkRamBundle({
      binaryPath: '/tmp/nonexistent.apk',
      bundlePath: 'assets/index.android.bundle',
      fileName: 'nonexistent.apk',
      projectRoot: '/tmp',
    });
    // Should return false (not RAM) rather than throwing.
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Embedded bundle existence check
// ---------------------------------------------------------------------------

describe('checkHasEmbeddedBundle', () => {
  let checkHasEmbeddedBundle: (params: {
    binaryPath: string;
    bundlePath: string;
    fileName: string;
    projectRoot: string;
  }) => Promise<boolean>;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    checkHasEmbeddedBundle = mod.checkHasEmbeddedBundle;
  });

  it('is exported as a named function', () => {
    expect(typeof checkHasEmbeddedBundle).toBe('function');
  });

  it('returns false for a nonexistent binary (fail-soft)', async () => {
    const result = await checkHasEmbeddedBundle({
      binaryPath: '/tmp/nonexistent.apk',
      bundlePath: 'assets/index.android.bundle',
      fileName: 'nonexistent.apk',
      projectRoot: '/tmp',
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Engine class derivation from config
// ---------------------------------------------------------------------------

describe('deriveEngineClass', () => {
  let deriveEngineClass: (params: {
    platform: 'android' | 'ios';
    projectRoot: string;
  }) => Promise<'hermes' | 'jsc'>;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    deriveEngineClass = mod.deriveEngineClass;
  });

  it('is exported as a function', () => {
    expect(typeof deriveEngineClass).toBe('function');
  });

  it('does not throw on a nonexistent project root (fail-soft)', async () => {
    const result = await deriveEngineClass({
      platform: 'android',
      projectRoot: '/tmp/nonexistent-project',
    });
    // Should return a valid engine class, not throw.
    expect(['hermes', 'jsc']).toContain(result);
  });

  it('returns a valid engine class for ios platform', async () => {
    const result = await deriveEngineClass({
      platform: 'ios',
      projectRoot: '/tmp/nonexistent-project',
    });
    expect(['hermes', 'jsc']).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// Expo-updates iOS plist parsing (Finding 4)
// ---------------------------------------------------------------------------

describe('parseExpoUpdatesEnabledFromPlist', () => {
  let parseExpoUpdatesEnabledFromPlist: (content: string) => boolean;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    parseExpoUpdatesEnabledFromPlist = mod.parseExpoUpdatesEnabledFromPlist;
  });

  // --- True cases ---

  it('returns true for <true/> (self-closing)', () => {
    const plist = `<?xml version="1.0">
<plist version="1.0">
<dict>
  <key>EXUpdatesEnabled</key>
  <true/>
</dict>
</plist>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(true);
  });

  it('returns true for <true /> (with space)', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <true />`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(true);
  });

  it('returns true for <string>YES</string>', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <string>YES</string>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(true);
  });

  // --- False cases ---

  it('returns false for <false/> (EXUpdatesEnabled explicitly disabled)', () => {
    const plist = `<?xml version="1.0">
<plist version="1.0">
<dict>
  <key>EXUpdatesEnabled</key>
  <false/>
</dict>
</plist>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });

  it('returns false for <false /> (with space, explicitly disabled)', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <false />`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });

  it('returns false for <string>NO</string>', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <string>NO</string>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });

  it('returns false when EXUpdatesEnabled key is absent', () => {
    const plist = `<?xml version="1.0">
<plist version="1.0">
<dict>
  <key>SomeOtherKey</key>
  <true/>
</dict>
</plist>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(parseExpoUpdatesEnabledFromPlist('')).toBe(false);
  });

  it('returns false when the key exists but has an unrecognised value', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <integer>1</integer>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });
});
