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

  it('returns true when EXUpdatesEnabled key is absent (default enabled per Expo convention)', () => {
    // When the plist exists but the EXUpdatesEnabled key is absent,
    // expo-updates is default-ENABLED. The stored metadata should be accurate
    // even though the runner patches the plist at splice time.
    const plist = `<?xml version="1.0">
<plist version="1.0">
<dict>
  <key>SomeOtherKey</key>
  <true/>
</dict>
</plist>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(true);
  });

  it('returns true for an empty string (no key → default enabled)', () => {
    expect(parseExpoUpdatesEnabledFromPlist('')).toBe(true);
  });

  it('returns false when the key exists but has an unrecognised value', () => {
    const plist = `<key>EXUpdatesEnabled</key>
  <integer>1</integer>`;
    expect(parseExpoUpdatesEnabledFromPlist(plist)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AXML (Android Binary XML) parser tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal AXML buffer for testing the expo-updates metadata parser.
 *
 * The produced binary is a stripped-down AndroidManifest.xml containing
 * exactly one `<meta-data>` element (or none, if `metaData` is null).
 *
 * @param metaData  The meta-data element to include, or null to omit.
 *                  - `name`:        the android:name value
 *                  - `valueBoolean`: if set, stored as TYPE_INT_BOOLEAN
 *                  - `valueString`:  if set (and valueBoolean is undefined),
 *                                    stored as TYPE_STRING
 */
function buildMinimalAxml(
  metaData: {
    name: string;
    valueBoolean?: boolean;
    valueString?: string;
  } | null
): Buffer {
  // ------------------------------------------------------------------
  // 1. Collect strings and assign indices
  // ------------------------------------------------------------------
  const strings: string[] = [
    'android', // 0
    'http://schemas.android.com/apk/res/android', // 1
    'manifest', // 2
  ];

  if (metaData) {
    strings.push('meta-data'); // 3
    strings.push('name'); // 4
    strings.push(metaData.name); // 5
    strings.push('value'); // 6
    if (metaData.valueString !== undefined) {
      strings.push(metaData.valueString); // 7
    }
  }

  const NS_ANDROID = 0;
  const NS_URI = 1;
  const STR_MANIFEST = 2;
  const STR_META_DATA = metaData ? 3 : -1;
  const STR_NAME = metaData ? 4 : -1;
  const STR_META_NAME = metaData ? 5 : -1;
  const STR_VALUE = metaData ? 6 : -1;
  const STR_VALUE_STRING = metaData && metaData.valueString !== undefined ? 7 : -1;

  // ------------------------------------------------------------------
  // 2. Build UTF-8 string data
  // ------------------------------------------------------------------
  const stringDataParts: Buffer[] = [];
  const stringOffsets: number[] = [];
  let dataCursor = 0;

  for (const s of strings) {
    stringOffsets.push(dataCursor);
    const utf8 = Buffer.from(s, 'utf8');
    const len = utf8.length;
    // Length prefix: varint-like (1 byte for len < 128, 2 bytes for len >= 128)
    if (len < 0x80) {
      stringDataParts.push(Buffer.from([len]));
      dataCursor += 1;
    } else {
      stringDataParts.push(Buffer.from([0x80 | ((len >> 8) & 0x7f), len & 0xff]));
      dataCursor += 2;
    }
    stringDataParts.push(utf8);
    stringDataParts.push(Buffer.from([0x00])); // null terminator
    dataCursor += len + 1;
  }

  const stringData = Buffer.concat(stringDataParts);

  // ------------------------------------------------------------------
  // 3. Calculate offsets within the buffer
  // ------------------------------------------------------------------
  const poolHeaderSize = 8; // chunk header
  const poolBodySize = 28; // ResStringPool_header fields
  const poolOffsetsSize = strings.length * 4;
  const poolHeaderEnd = poolHeaderSize + poolBodySize + poolOffsetsSize;
  // string offsets are relative to the start of the pool chunk
  const stringsStartOffset = poolHeaderEnd; // offset from pool chunk start
  const poolChunkSize = poolHeaderEnd + stringData.length;

  // Total pool offsets (relative to pool chunk start):
  // stringOffsets[i] + stringsStartOffset

  // Chunk positions (absolute offsets in the buffer)
  const XML_HEADER_SIZE = 8;
  const POOL_START = XML_HEADER_SIZE;
  const POOL_END = POOL_START + poolChunkSize;

  const START_NS_SIZE = 24;
  const START_NS_START = POOL_END;

  const MANIFEST_TAG_SIZE = 36; // no attributes
  const MANIFEST_TAG_START = START_NS_START + START_NS_SIZE;

  let nextOffset = MANIFEST_TAG_START + MANIFEST_TAG_SIZE;

  let META_TAG_START = -1;
  let META_TAG_SIZE = 0;
  let _META_END_TAG_START = -1;
  if (metaData) {
    META_TAG_START = nextOffset;
    META_TAG_SIZE = 36 + 2 * 20; // 2 attributes
    nextOffset = META_TAG_START + META_TAG_SIZE;
    _META_END_TAG_START = nextOffset;
    nextOffset += 24; // end tag
  }

  const _MANIFEST_END_TAG_START = nextOffset;
  const MANIFEST_END_TAG_SIZE = 24;
  nextOffset += MANIFEST_END_TAG_SIZE;

  const _END_NS_START = nextOffset;
  const END_NS_SIZE = 24;
  nextOffset += END_NS_SIZE;

  const TOTAL_SIZE = nextOffset;

  // ------------------------------------------------------------------
  // 4. Build the buffer
  // ------------------------------------------------------------------
  const buf = Buffer.alloc(TOTAL_SIZE, 0);
  let pos = 0;

  // Write helper for uint32LE
  function w32(offset: number, value: number): void {
    buf.writeUInt32LE(value, offset);
  }
  function w16(offset: number, value: number): void {
    buf.writeUInt16LE(value, offset);
  }

  // --- XML Header chunk (0x0003) ---
  w16(pos, 0x0003); // type
  w16(pos + 2, 8); // headerSize
  w32(pos + 4, TOTAL_SIZE); // chunkSize
  pos += 8;

  // --- String Pool chunk (0x0001) ---
  const _poolBase = pos;
  w16(pos, 0x0001); // type
  w16(pos + 2, 28); // headerSize
  w32(pos + 4, poolChunkSize); // chunkSize
  w32(pos + 8, strings.length); // stringCount
  w32(pos + 12, 0); // styleCount
  w32(pos + 16, 0x100); // flags (UTF-8)
  w32(pos + 20, stringsStartOffset); // stringsStart
  w32(pos + 24, 0); // stylesStart
  // String offsets
  for (let i = 0; i < strings.length; i++) {
    w32(pos + 28 + i * 4, stringsStartOffset + stringOffsets[i]);
  }
  // String data
  stringData.copy(buf, pos + stringsStartOffset);
  pos = POOL_END;

  // --- Start Namespace (0x0100) ---
  w16(pos, 0x0100);
  w16(pos + 2, 16);
  w32(pos + 4, START_NS_SIZE);
  w32(pos + 8, 0); // line
  w32(pos + 12, 0xffffffff); // comment
  w32(pos + 16, NS_ANDROID); // prefix "android"
  w32(pos + 20, NS_URI); // uri
  pos += START_NS_SIZE;

  // --- Start Tag: "manifest" (0x0102, no attributes) ---
  w16(pos, 0x0102);
  w16(pos + 2, 16);
  w32(pos + 4, MANIFEST_TAG_SIZE);
  w32(pos + 8, 0); // line
  w32(pos + 12, 0xffffffff); // comment
  w32(pos + 16, 0xffffffff); // nsUri (none)
  w32(pos + 20, STR_MANIFEST); // name
  w32(pos + 24, 0x00140014); // flags
  w32(pos + 28, 0); // attributeCount
  w32(pos + 32, 0); // classAttribute
  pos += MANIFEST_TAG_SIZE;

  if (metaData) {
    // --- Start Tag: "meta-data" (0x0102, 2 attributes) ---
    w16(pos, 0x0102);
    w16(pos + 2, 16);
    w32(pos + 4, META_TAG_SIZE);
    w32(pos + 8, 0); // line
    w32(pos + 12, 0xffffffff); // comment
    w32(pos + 16, 0xffffffff); // nsUri
    w32(pos + 20, STR_META_DATA); // name "meta-data"
    w32(pos + 24, 0x00140014); // flags
    w32(pos + 28, 2); // attributeCount
    w32(pos + 32, 0); // classAttribute

    // Attribute 0: android:name = metaData.name (TYPE_STRING)
    const attr0 = pos + 36;
    w32(attr0, NS_URI); // ns: android
    w32(attr0 + 4, STR_NAME); // name: "name"
    w32(attr0 + 8, STR_META_NAME); // rawValue: the expo-updates key
    w32(attr0 + 12, (AXML_TYPE_STRING << 24) | 8); // typedValue: TYPE_STRING, size=8
    w32(attr0 + 16, 0); // data

    // Attribute 1: android:value
    const attr1 = pos + 36 + 20;
    w32(attr1, NS_URI); // ns: android
    w32(attr1 + 4, STR_VALUE); // name: "value"

    if (metaData.valueBoolean !== undefined) {
      // TYPE_INT_BOOLEAN: data = 0xFFFFFFFF for true, 0 for false
      w32(attr1 + 8, AXML_NO_INDEX); // rawValue: none
      w32(attr1 + 12, (AXML_TYPE_INT_BOOLEAN << 24) | 8);
      w32(attr1 + 16, metaData.valueBoolean ? 0xffffffff : 0x00000000);
    } else {
      // TYPE_STRING: rawValue points to the string, then data field
      w32(attr1 + 8, STR_VALUE_STRING); // rawValue: "true" or "false"
      w32(attr1 + 12, (AXML_TYPE_STRING << 24) | 8);
      w32(attr1 + 16, STR_VALUE_STRING); // data: same index
    }

    pos += META_TAG_SIZE;

    // --- End Tag: "meta-data" (0x0103) ---
    w16(pos, 0x0103);
    w16(pos + 2, 16);
    w32(pos + 4, 24);
    w32(pos + 8, 0); // line
    w32(pos + 12, 0xffffffff); // comment
    w32(pos + 16, 0xffffffff); // nsUri
    w32(pos + 20, STR_META_DATA); // name
    pos += 24;
  }

  // --- End Tag: "manifest" (0x0103) ---
  w16(pos, 0x0103);
  w16(pos + 2, 16);
  w32(pos + 4, 24);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, 0xffffffff);
  w32(pos + 20, STR_MANIFEST);
  pos += 24;

  // --- End Namespace (0x0101) ---
  w16(pos, 0x0101);
  w16(pos + 2, 16);
  w32(pos + 4, 24);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, NS_ANDROID);
  w32(pos + 20, NS_URI);

  return buf;
}

// AXML constants (mirror gateMetadata for tests)
const AXML_TYPE_STRING = 3;
const AXML_TYPE_INT_BOOLEAN = 18;
const AXML_NO_INDEX = 0xffffffff;

describe('parseAxmlExpoUpdatesEnabled', () => {
  let parseAxmlExpoUpdatesEnabled: (buffer: Buffer) => boolean | null;

  beforeAll(async () => {
    const mod = await import('../gateMetadata');
    parseAxmlExpoUpdatesEnabled = mod.parseAxmlExpoUpdatesEnabled;
  });

  it('is exported as a named function', () => {
    expect(typeof parseAxmlExpoUpdatesEnabled).toBe('function');
  });

  // --- TYPE_INT_BOOLEAN value tests ---

  it('returns true for ENABLED=true (TYPE_INT_BOOLEAN)', () => {
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.ENABLED',
      valueBoolean: true,
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(true);
  });

  it('returns false for ENABLED=false (TYPE_INT_BOOLEAN)', () => {
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.ENABLED',
      valueBoolean: false,
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(false);
  });

  // --- TYPE_STRING value tests ---

  it('returns true for ENABLED="true" (TYPE_STRING)', () => {
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.ENABLED',
      valueString: 'true',
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(true);
  });

  it('returns false for ENABLED="false" (TYPE_STRING)', () => {
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.ENABLED',
      valueString: 'false',
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(false);
  });

  // --- No expo-updates metadata ---

  it('returns false when no expo-updates meta-data exists', () => {
    // Build AXML with no meta-data element at all
    const buf = buildMinimalAxml(null);
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(false);
  });

  // --- Other expo-updates key (default enabled) ---

  it('returns true when expo-updates is configured but ENABLED key is absent', () => {
    // EXPO_RUNTIME_VERSION present but no ENABLED key → default enabled
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.EXPO_RUNTIME_VERSION',
      valueString: '1.0.0',
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(true);
  });

  // --- Edge cases ---

  it('returns null for a non-AXML buffer (corrupted/empty)', () => {
    const buf = Buffer.alloc(4, 0);
    // Not an AXML resource type (must start with 0x0003)
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(null);
  });

  it('returns false for ENABLED with unrecognised string value', () => {
    // A TYPE_STRING value that is not "true" is treated as false.
    // This covers the edge case where the value attribute exists but
    // doesn't match any recognised truthy form.
    const buf = buildMinimalAxml({
      name: 'expo.modules.updates.ENABLED',
      valueString: 'some-unexpected-value',
    });
    expect(parseAxmlExpoUpdatesEnabled(buf)).toBe(false);
  });
});
