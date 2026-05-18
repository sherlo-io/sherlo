import { expect } from 'vitest';
import { PLATFORM } from './platform.js';
import type { ProtocolEntry } from './runner-sim.js';

/**
 * The SDK uses this dummy story id internally when no real story is selected
 * (see constants.ts in the SDK). It must never appear in protocol items that
 * the runner consumes.
 */
const DUMMY_STORY_ID = 'SherloInitialTestingDummyStory--SherloDummyStory';
const DUMMY_STORY_PATTERN = /dummystory/i;

function assertNoDummyStoryId(storyId: unknown, context: string): void {
  if (typeof storyId !== 'string') return;  // not our concern
  expect(
    storyId,
    `${context}: dummy story id leaked verbatim: '${storyId}'`,
  ).not.toBe(DUMMY_STORY_ID);
  expect(
    DUMMY_STORY_PATTERN.test(storyId),
    `${context}: storyId contains 'DummyStory' substring (case-insensitive): '${storyId}'`,
  ).toBe(false);
}

/**
 * Strip volatile fields (absolute pixel coords, native tags, density-derived
 * adjusted dimensions) from a view hierarchy node, keeping only the structural
 * shape: className + properties + recursive children. Suitable input for
 * snapshot testing - stays stable across devices and runs.
 */
function canonicalizeViewHierarchy(node: unknown): unknown {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;
  const n = node as Record<string, unknown>;
  return {
    className: n.className,
    isVisible: n.isVisible,
    properties: n.properties ?? {},
    children: Array.isArray(n.children) ? n.children.map(canonicalizeViewHierarchy) : [],
  };
}

const BOOT_SEQUENCE = [
  'NATIVE_INIT_STARTED',
  'NATIVE_LOADED',
  'JS_EVAL_COMPLETE',
  'STORYBOOK_LOADED',
  'STORYBOOK_RENDERED',
] as const;

/** Asserts NATIVE_INIT_STARTED → JS_EVAL_COMPLETE → STORYBOOK_LOADED → STORYBOOK_RENDERED appear in that order. */
export function expectBootSequence(protocol: ProtocolEntry[]): void {
  const actions = protocol.map(e => e.action);
  const indices = BOOT_SEQUENCE.map(a => actions.indexOf(a));

  BOOT_SEQUENCE.forEach((name, i) => {
    expect(
      indices[i],
      `expectBootSequence: '${name}' missing. Observed: [${actions.join(', ')}]`,
    ).toBeGreaterThanOrEqual(0);
  });

  for (let i = 1; i < BOOT_SEQUENCE.length; i++) {
    expect(
      indices[i]! > indices[i - 1]!,
      `expectBootSequence: '${BOOT_SEQUENCE[i]}' (idx=${String(indices[i])}) must follow '${BOOT_SEQUENCE[i - 1]}' (idx=${String(indices[i - 1])}). Observed: [${actions.join(', ')}]`,
    ).toBe(true);
  }
}

/** Asserts the START item has exactly the given snapshots (length + per-entry toMatchObject), order-independent. */
export function expectStartItem(
  start: ProtocolEntry,
  expected: { snapshots: Array<Record<string, unknown>> },
): void {
  expect(start.action).toBe('START');
  const actual = (start.snapshots as Array<Record<string, unknown>> | undefined) ?? [];

  const sortByStoryId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.storyId).localeCompare(String(b.storyId));
  const sortedActual = [...actual].sort(sortByStoryId);
  const sortedExpected = [...expected.snapshots].sort(sortByStoryId);

  const actualIds = sortedActual.map(s => s.storyId).join(',');
  const expectedIds = sortedExpected.map(s => s.storyId).join(',');

  expect(
    sortedActual,
    `expectStartItem: expected ${sortedExpected.length} snapshot(s) [${expectedIds}], got ${sortedActual.length} [${actualIds}]`,
  ).toHaveLength(sortedExpected.length);

  sortedExpected.forEach((snap, i) => {
    expect(sortedActual[i]).toMatchObject(snap);
  });

  for (const snap of sortedActual) {
    assertNoDummyStoryId(snap.storyId, 'expectStartItem: START.snapshots');
  }
}

/**
 * Asserts the protocol is structurally well-formed:
 *   - every entry has `action` (string), `timestamp` (positive number), `entity` ('app' | 'runner')
 *   - timestamps are non-decreasing within each entity (clock sanity per producer)
 *
 * Does NOT assert content beyond shape. Specific semantic invariants
 * (boot sequence, dummy leak, etc.) live in their own helpers.
 */
export function expectProtocolWellFormed(protocol: ProtocolEntry[]): void {
  const lastTimestampByEntity: Record<string, number> = {};
  for (let i = 0; i < protocol.length; i++) {
    const e = protocol[i] as Partial<ProtocolEntry> & Record<string, unknown>;
    const ctx = `expectProtocolWellFormed: entry[${i}]`;

    expect(
      typeof e.action,
      `${ctx}: action must be a string, got ${typeof e.action}. Entry: ${JSON.stringify(e)}`,
    ).toBe('string');

    const ts = e.timestamp;
    expect(
      typeof ts === 'number' && ts > 0,
      `${ctx}: timestamp must be a positive number, got ${String(ts)}. Entry: ${JSON.stringify(e)}`,
    ).toBe(true);

    const entity = e.entity as string | undefined;
    expect(
      entity === 'app' || entity === 'runner',
      `${ctx}: entity must be 'app' or 'runner', got '${String(entity)}'. Entry: ${JSON.stringify(e)}`,
    ).toBe(true);

    const key = String(entity);
    const last = lastTimestampByEntity[key];
    if (last !== undefined) {
      expect(
        (ts as number) >= last,
        `${ctx}: timestamps for entity='${key}' must be non-decreasing; entry[${i}] ts=${ts} < previous ${last}. Entry: ${JSON.stringify(e)}`,
      ).toBe(true);
    }
    lastTimestampByEntity[key] = ts as number;
  }
}

/** Asserts no JS_ERROR or NATIVE_ERROR entries appeared in protocol. */
export function expectNoErrors(protocol: ProtocolEntry[]): void {
  const errors = protocol.filter(e => e.action === 'JS_ERROR' || e.action === 'NATIVE_ERROR');
  expect(
    errors,
    `expectNoErrors: unexpected error entries: ${JSON.stringify(errors)}`,
  ).toHaveLength(0);
}

/**
 * Asserts at least one log.sherlo line matches `HH:MM:SS: <key> : <json>`.
 * If params is provided, the parsed JSON must toMatchObject(params).
 */
export function expectSdkLog(log: string, key: string, params?: Record<string, unknown>): void {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = log.match(new RegExp(`^\\d{2}:\\d{2}:\\d{2}: ${escaped} : (.+)$`, 'm'));
  expect(match, `expectSdkLog: no log line found for key '${key}'`).not.toBeNull();
  if (params !== undefined && match?.[1] !== undefined) {
    const parsed = JSON.parse(match[1]) as unknown;
    expect(parsed).toMatchObject(params);
  }
}

/**
 * Snapshot-test the canonical view hierarchy from a REQUEST_SNAPSHOT.
 * On first run, vitest records the snapshot under __snapshots__/.
 * On subsequent runs, asserts the canonical hierarchy matches the recorded snapshot.
 *
 * Use `label` to give the snapshot a stable name within a multi-snapshot test
 * (e.g., `render--static-hierarchy`).
 */
export function expectSnapshotMatch(req: ProtocolEntry, label: string): void {
  const raw = (req as any).inspectorData;
  expect(typeof raw, `expectSnapshotMatch: inspectorData must be a string`).toBe('string');
  let parsed: { viewHierarchy?: unknown } = {};
  try { parsed = JSON.parse(raw as string); } catch (e) {
    expect.fail(`expectSnapshotMatch: inspectorData is not valid JSON: ${String(e)}`);
  }
  const canonical = canonicalizeViewHierarchy(parsed.viewHierarchy);
  expect(canonical).toMatchSnapshot(`${PLATFORM}-${label}`);
}

/**
 * Asserts a `JS_ERROR` protocol entry was emitted with the expected error data.
 * Optional fields are matched via substring inclusion.
 */
export function expectJsError(
  protocol: ProtocolEntry[],
  expected: {
    nameContains?: string;
    messageContains?: string;
  } = {},
): void {
  const errors = protocol.filter(e => e.action === 'JS_ERROR');
  expect(errors, 'expectJsError: no JS_ERROR entry found in protocol').not.toHaveLength(0);
  if (expected.nameContains || expected.messageContains) {
    const matched = errors.find(e => {
      const data = (e.data ?? {}) as { name?: string; message?: string };
      if (expected.nameContains && !String(data.name ?? '').includes(expected.nameContains)) return false;
      if (expected.messageContains && !String(data.message ?? '').includes(expected.messageContains)) return false;
      return true;
    });
    expect(
      matched,
      `expectJsError: no JS_ERROR matched name~='${expected.nameContains ?? '*'}' message~='${expected.messageContains ?? '*'}'`,
    ).toBeDefined();
  }
}

/**
 * Asserts a NATIVE_ERROR entry was written to protocol with the expected errorCode.
 * Protocol shape (from ProtocolHelper.java): { action: 'NATIVE_ERROR', errorCode, message, timestamp, entity }
 */
export function expectNativeError(
  protocol: ProtocolEntry[],
  expected: { code: string },
): void {
  const errors = protocol.filter(e => e.action === 'NATIVE_ERROR');
  expect(errors, 'expectNativeError: no NATIVE_ERROR entry found in protocol').not.toHaveLength(0);
  const matched = errors.find(e => e.errorCode === expected.code);
  expect(
    matched,
    `expectNativeError: no NATIVE_ERROR matched errorCode='${expected.code}'. Found: ${JSON.stringify(errors.map(e => e.errorCode))}`,
  ).toBeDefined();
}

/**
 * Asserts a REQUEST_SNAPSHOT entry matches the expected storyId, hasError, isStable.
 * When `errorMessageContains` is set, also asserts `req.error.message` contains the substring.
 */
export function expectRequestSnapshotItem(
  req: ProtocolEntry,
  expected: {
    storyId: string;
    hasError?: boolean;
    isStable?: boolean;
    errorMessageContains?: string;
  },
): void {
  expect(req.action).toBe('REQUEST_SNAPSHOT');
  const { errorMessageContains, ...rest } = expected;
  expect(req).toMatchObject(rest);
  assertNoDummyStoryId((req as any).storyId, 'expectRequestSnapshotItem: REQUEST_SNAPSHOT');
  if (errorMessageContains !== undefined) {
    const error = (req as any).error as { message?: string } | undefined;
    expect(
      error,
      `expectRequestSnapshotItem: req.error undefined for storyId='${expected.storyId}'; expected message ~ '${errorMessageContains}'`,
    ).toBeDefined();
    expect(
      String(error?.message ?? ''),
      `expectRequestSnapshotItem: req.error.message for storyId='${expected.storyId}' did not contain '${errorMessageContains}'. Got: '${String(error?.message)}'`,
    ).toContain(errorMessageContains);
  }

  // 1. inspectorData must parse as JSON and contain viewHierarchy
  const inspectorRaw = (req as any).inspectorData;
  expect(
    typeof inspectorRaw,
    `expectRequestSnapshotItem: inspectorData must be a string, got ${typeof inspectorRaw}`,
  ).toBe('string');
  let inspector: { viewHierarchy?: unknown } | null = null;
  try { inspector = JSON.parse(inspectorRaw as string); } catch (e) {
    expect.fail(`expectRequestSnapshotItem: inspectorData is not valid JSON: ${String(e)}`);
  }
  expect(
    inspector?.viewHierarchy,
    `expectRequestSnapshotItem: inspectorData.viewHierarchy missing`,
  ).toBeDefined();

  // 2. requestId pattern
  const requestId = (req as any).requestId;
  expect(
    typeof requestId === 'string' && /^rq-\d+$/.test(requestId),
    `expectRequestSnapshotItem: requestId must match /^rq-\\d+$/, got '${String(requestId)}'`,
  ).toBe(true);

  // 3. timestamp must be a positive number
  const timestamp = (req as any).timestamp;
  expect(
    typeof timestamp === 'number' && timestamp > 0,
    `expectRequestSnapshotItem: timestamp must be a positive number, got ${String(timestamp)}`,
  ).toBe(true);

  // 4. entity === 'app'
  expect(
    (req as any).entity,
    `expectRequestSnapshotItem: entity must be 'app' (sent by app), got '${String((req as any).entity)}'`,
  ).toBe('app');

  // 5/6. hasError <-> error consistency
  const hasError = (req as any).hasError;
  const errorVal = (req as any).error;
  if (hasError === true) {
    expect(
      errorVal,
      `expectRequestSnapshotItem: hasError=true but error is undefined. req=${JSON.stringify(req)}`,
    ).toBeDefined();
  } else if (hasError === false) {
    expect(
      errorVal,
      `expectRequestSnapshotItem: hasError=false but error is defined (${JSON.stringify(errorVal)})`,
    ).toBeUndefined();
  }
}
