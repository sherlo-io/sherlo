/**
 * A packaged AndroidManifest.xml (Android binary XML) built in memory, holding the
 * `<meta-data>` entries a test names - the manifest an APK carries, without an APK.
 * Shared by the manifest reader's own tests and the gate-facts tests that read it
 * out of an app build.
 */

// AXML constants (mirror gateMetadata for tests)
export const AXML_TYPE_STRING = 3;
export const AXML_TYPE_INT_BOOLEAN = 18;
export const AXML_NO_INDEX = 0xffffffff;

export type MetaData = { name: string; valueBoolean?: boolean; valueString?: string };

/**
 * Build an AXML buffer with N `<meta-data>` elements in the GIVEN ORDER.
 *
 * AXML key order is build-tool-determined, so the ENABLED key can sit AFTER
 * other expo-updates keys. This builder lets a test place, e.g.,
 * EXPO_RUNTIME_VERSION before ENABLED=false - the exact ordering that made the
 * old "return true on the first expo-updates key" parser misclassify an app
 * with updates disabled as enabled.
 */
export function buildAxmlWithMetaData(metaDataList: MetaData[]): Buffer {
  // --- String table (dedup, index-assigned in insertion order) ---
  const strings: string[] = [];
  const indexOf = (s: string): number => {
    let i = strings.indexOf(s);
    if (i === -1) {
      i = strings.length;
      strings.push(s);
    }
    return i;
  };

  const STR_ANDROID = indexOf('android');
  const STR_NS_URI = indexOf('http://schemas.android.com/apk/res/android');
  const STR_MANIFEST = indexOf('manifest');
  const STR_META_DATA = indexOf('meta-data');
  const STR_NAME = indexOf('name');
  const STR_VALUE = indexOf('value');
  for (const md of metaDataList) {
    indexOf(md.name);
    if (md.valueString !== undefined) indexOf(md.valueString);
  }

  // --- UTF-8 string data (length-prefixed, null-terminated) ---
  const stringDataParts: Buffer[] = [];
  const stringOffsets: number[] = [];
  let dataCursor = 0;
  for (const s of strings) {
    stringOffsets.push(dataCursor);
    const utf8 = Buffer.from(s, 'utf8');
    const len = utf8.length;
    if (len < 0x80) {
      stringDataParts.push(Buffer.from([len]));
      dataCursor += 1;
    } else {
      stringDataParts.push(Buffer.from([0x80 | ((len >> 8) & 0x7f), len & 0xff]));
      dataCursor += 2;
    }
    stringDataParts.push(utf8, Buffer.from([0x00]));
    dataCursor += len + 1;
  }
  const stringData = Buffer.concat(stringDataParts);

  // --- Chunk sizes / offsets ---
  const poolHeaderEnd = 8 + 28 + strings.length * 4;
  const stringsStartOffset = poolHeaderEnd;
  const poolChunkSize = poolHeaderEnd + stringData.length;

  const XML_HEADER_SIZE = 8;
  const POOL_START = XML_HEADER_SIZE;
  const POOL_END = POOL_START + poolChunkSize;
  const START_NS_SIZE = 24;
  const MANIFEST_TAG_SIZE = 36;
  const META_TAG_SIZE = 36 + 2 * 20;
  const META_END_TAG_SIZE = 24;
  const MANIFEST_END_TAG_SIZE = 24;
  const END_NS_SIZE = 24;

  const TOTAL_SIZE =
    POOL_END +
    START_NS_SIZE +
    MANIFEST_TAG_SIZE +
    metaDataList.length * (META_TAG_SIZE + META_END_TAG_SIZE) +
    MANIFEST_END_TAG_SIZE +
    END_NS_SIZE;

  const buf = Buffer.alloc(TOTAL_SIZE, 0);
  const w32 = (offset: number, value: number): void => void buf.writeUInt32LE(value >>> 0, offset);
  const w16 = (offset: number, value: number): void => void buf.writeUInt16LE(value, offset);

  // XML header
  w16(0, 0x0003);
  w16(2, 8);
  w32(4, TOTAL_SIZE);

  // String pool
  let pos = POOL_START;
  w16(pos, 0x0001);
  w16(pos + 2, 28);
  w32(pos + 4, poolChunkSize);
  w32(pos + 8, strings.length);
  w32(pos + 12, 0);
  w32(pos + 16, 0x100); // UTF-8
  w32(pos + 20, stringsStartOffset);
  w32(pos + 24, 0);
  for (let i = 0; i < strings.length; i++) {
    w32(pos + 28 + i * 4, stringsStartOffset + stringOffsets[i]);
  }
  stringData.copy(buf, pos + stringsStartOffset);
  pos = POOL_END;

  // Start namespace
  w16(pos, 0x0100);
  w16(pos + 2, 16);
  w32(pos + 4, START_NS_SIZE);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, STR_ANDROID);
  w32(pos + 20, STR_NS_URI);
  pos += START_NS_SIZE;

  // Start tag: manifest (no attributes)
  w16(pos, 0x0102);
  w16(pos + 2, 16);
  w32(pos + 4, MANIFEST_TAG_SIZE);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, 0xffffffff);
  w32(pos + 20, STR_MANIFEST);
  w32(pos + 24, 0x00140014);
  w32(pos + 28, 0);
  w32(pos + 32, 0);
  pos += MANIFEST_TAG_SIZE;

  // Each meta-data element, in order
  for (const md of metaDataList) {
    w16(pos, 0x0102);
    w16(pos + 2, 16);
    w32(pos + 4, META_TAG_SIZE);
    w32(pos + 8, 0);
    w32(pos + 12, 0xffffffff);
    w32(pos + 16, 0xffffffff);
    w32(pos + 20, STR_META_DATA);
    w32(pos + 24, 0x00140014);
    w32(pos + 28, 2); // attributeCount
    w32(pos + 32, 0);

    // attr 0: android:name = md.name (TYPE_STRING)
    const attr0 = pos + 36;
    w32(attr0, STR_NS_URI);
    w32(attr0 + 4, STR_NAME);
    w32(attr0 + 8, indexOf(md.name));
    w32(attr0 + 12, (AXML_TYPE_STRING << 24) | 8);
    w32(attr0 + 16, 0);

    // attr 1: android:value
    const attr1 = pos + 36 + 20;
    w32(attr1, STR_NS_URI);
    w32(attr1 + 4, STR_VALUE);
    if (md.valueBoolean !== undefined) {
      w32(attr1 + 8, AXML_NO_INDEX);
      w32(attr1 + 12, (AXML_TYPE_INT_BOOLEAN << 24) | 8);
      w32(attr1 + 16, md.valueBoolean ? 0xffffffff : 0x00000000);
    } else {
      const valueIdx = md.valueString !== undefined ? indexOf(md.valueString) : AXML_NO_INDEX;
      w32(attr1 + 8, valueIdx);
      w32(attr1 + 12, (AXML_TYPE_STRING << 24) | 8);
      w32(attr1 + 16, valueIdx);
    }
    pos += META_TAG_SIZE;

    // End tag: meta-data
    w16(pos, 0x0103);
    w16(pos + 2, 16);
    w32(pos + 4, META_END_TAG_SIZE);
    w32(pos + 8, 0);
    w32(pos + 12, 0xffffffff);
    w32(pos + 16, 0xffffffff);
    w32(pos + 20, STR_META_DATA);
    pos += META_END_TAG_SIZE;
  }

  // End tag: manifest
  w16(pos, 0x0103);
  w16(pos + 2, 16);
  w32(pos + 4, MANIFEST_END_TAG_SIZE);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, 0xffffffff);
  w32(pos + 20, STR_MANIFEST);
  pos += MANIFEST_END_TAG_SIZE;

  // End namespace
  w16(pos, 0x0101);
  w16(pos + 2, 16);
  w32(pos + 4, END_NS_SIZE);
  w32(pos + 8, 0);
  w32(pos + 12, 0xffffffff);
  w32(pos + 16, STR_ANDROID);
  w32(pos + 20, STR_NS_URI);

  return buf;
}
