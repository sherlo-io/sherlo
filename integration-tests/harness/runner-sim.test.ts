import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./device-files.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  deleteFile: vi.fn(),
  tailFile: vi.fn(),
}));

import * as deviceFiles from './device-files.js';
import { AndroidDevice } from './android-device.js';
import { createRunnerSim } from './runner-sim.js';

const mockAppendFile = vi.mocked(deviceFiles.appendFile);
const mockDeleteFile = vi.mocked(deviceFiles.deleteFile);
const mockReadFile = vi.mocked(deviceFiles.readFile);
const mockWriteFile = vi.mocked(deviceFiles.writeFile);

const SERIAL = 'emulator-5554';
const PKG = 'com.example.app';

function makeDevice() {
  return new AndroidDevice(SERIAL);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDeleteFile.mockReturnValue(undefined);
  mockReadFile.mockReturnValue('');
});

// ── Test 1: expectStart resolves when protocol contains a START line ──────────

describe('expectStart()', () => {
  it('resolves when protocol contains a START line', async () => {
    const entry = { action: 'START', snapshots: [], timestamp: 100, entity: 'app' };
    const line = JSON.stringify(entry);
    mockReadFile.mockReturnValueOnce(line + '\n');

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 0 });
    const result = await sim.expectStart(5000);

    expect(result.action).toBe('START');
    expect(result['entity']).toBe('app');
    expect(result['snapshots']).toEqual([]);
  });

  // ── Test 2: expectStart times out when no START arrives ─────────────────────

  it('rejects with a descriptive timeout error when no START arrives', async () => {
    // timeoutMs: 0 causes the deadline to be exceeded on the very first tick
    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 10 });
    await expect(sim.expectStart(0)).rejects.toThrow('timed out waiting for START');
  });
});

// ── Test 3: ackRequestSnapshot writes the right JSON shape ────────────────────

describe('ackRequestSnapshot()', () => {
  it('writes correct ACK_REQUEST_SNAPSHOT shape including requestId from REQUEST_SNAPSHOT', async () => {
    const startLine = JSON.stringify({ action: 'START', snapshots: [], timestamp: 1, entity: 'app' });
    const reqLine = JSON.stringify({ action: 'REQUEST_SNAPSHOT', requestId: 'req-42', hasError: false });

    // readFile is called once per waitFor tick (inline tail logic).
    // Return cumulative content so token-based slicing gives the right new lines.
    mockReadFile
      .mockReturnValueOnce(startLine + '\n')
      .mockReturnValueOnce(startLine + '\n' + reqLine + '\n');

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 0 });
    await sim.expectStart(5000);
    await sim.ackStart({ storyId: 'Button/default' });
    await sim.expectRequestSnapshot(5000);
    await sim.ackRequestSnapshot({ storyId: 'Button/secondary' });

    const ackReqCall = mockAppendFile.mock.calls.find(c => c[3]?.includes('ACK_REQUEST_SNAPSHOT'));
    expect(ackReqCall).toBeDefined();
    const written = JSON.parse(ackReqCall![3]!.trim()) as Record<string, unknown>;
    expect(written['action']).toBe('ACK_REQUEST_SNAPSHOT');
    expect(written['nextSnapshot']).toMatchObject({ storyId: 'Button/secondary' });
    expect(written['requestId']).toBe('req-42');
    expect(typeof written['nextSnapshotIndex']).toBe('number');
  });

  it('sets nextSnapshot to null and nextSnapshotIndex to null when ending the session', async () => {
    const startLine = JSON.stringify({ action: 'START' });
    const reqLine = JSON.stringify({ action: 'REQUEST_SNAPSHOT', requestId: 'req-end' });

    mockReadFile
      .mockReturnValueOnce(startLine + '\n')
      .mockReturnValueOnce(startLine + '\n' + reqLine + '\n');

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 0 });
    await sim.expectStart(5000);
    await sim.ackStart({ storyId: 'story1' });
    await sim.expectRequestSnapshot(5000);
    await sim.ackRequestSnapshot(null);

    const ackReqCall = mockAppendFile.mock.calls.find(c => c[3]?.includes('ACK_REQUEST_SNAPSHOT'));
    const written = JSON.parse(ackReqCall![3]!.trim()) as Record<string, unknown>;
    // nextSnapshot is absent from JSON when ending session (undefined → key omitted)
    expect(written['nextSnapshot']).toBeUndefined();
    expect(written['nextSnapshotIndex']).toBeNull();
  });
});

// ── Test 4: waitForStoryDisplayed resolves on matching log line ───────────────

describe('waitForStoryDisplayed()', () => {
  it('resolves when log.sherlo contains a matching "story is displayed" line', async () => {
    const storyId = 'Button/default';
    const logLine = `story is displayed: ${storyId}`;
    mockReadFile.mockReturnValueOnce(logLine + '\n');

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 0 });
    await expect(sim.waitForStoryDisplayed(storyId, 5000)).resolves.toBeUndefined();
  });

  it('resolves for any "story is displayed" line (matcher is storyId-agnostic by design)', async () => {
    // The matcher intentionally matches any 'story is displayed' line because the SDK
    // logs it without a storyId payload and tests launch one story at a time.
    const logLine = 'story is displayed: Checkbox/default';
    mockReadFile.mockReturnValueOnce(logLine + '\n');

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG, pollIntervalMs: 0 });
    await expect(sim.waitForStoryDisplayed('Button/default', 5000)).resolves.toBeUndefined();
  });
});

// ── Test 5: readProtocol returns parsed entries from JSONL ────────────────────

describe('readProtocol()', () => {
  it('parses JSONL content into an array of ProtocolEntry objects', async () => {
    const line1 = JSON.stringify({ action: 'START', timestamp: 1 });
    const line2 = JSON.stringify({ action: 'ACK_START', nextSnapshotIndex: 0, nextSnapshot: null, requestId: 'r1' });
    const line3 = JSON.stringify({ action: 'REQUEST_SNAPSHOT', requestId: 'r2', hasError: false });
    mockReadFile.mockReturnValue(`${line1}\n${line2}\n${line3}\n`);

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG });
    const entries = sim.readProtocol();

    expect(entries).toHaveLength(3);
    expect(entries[0]!.action).toBe('START');
    expect(entries[1]!.action).toBe('ACK_START');
    expect(entries[2]!.action).toBe('REQUEST_SNAPSHOT');
  });

  it('skips empty lines and invalid JSON', async () => {
    const valid = JSON.stringify({ action: 'START' });
    mockReadFile.mockReturnValue(`${valid}\n\nbad-json\n`);

    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG });
    const entries = sim.readProtocol();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('START');
  });
});

// ── Test 6: writeConfig writes the correct JSON shape ────────────────────────

describe('writeConfig()', () => {
  it('writes full runner-default config when called with no args', async () => {
    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG });
    await sim.writeConfig();

    expect(mockWriteFile).toHaveBeenCalledWith(SERIAL, PKG, 'config.sherlo', expect.any(String));
    const written = JSON.parse(mockWriteFile.mock.calls[0]![3]!) as Record<string, unknown>;

    expect(written).not.toHaveProperty('mode');
    expect(written).toHaveProperty('stabilization');
    expect(written).toHaveProperty('initialStoryRenderDelayMs', 500);

    const stab = written['stabilization'] as Record<string, unknown>;
    expect(stab).toHaveProperty('requiredMatches', 3);
    expect(stab).toHaveProperty('minScreenshotsCount', 6);
    expect(stab).toHaveProperty('intervalMs', 500);
    expect(stab).toHaveProperty('timeoutMs', 20000);
    expect(stab).toHaveProperty('saveScreenshots', true);
    expect(stab).toHaveProperty('threshold', 0.02);
    expect(stab).toHaveProperty('includeAA', true);
  });

  it('merges caller-provided stabilization overrides with defaults', async () => {
    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG });
    await sim.writeConfig({ stabilization: { requiredMatches: 5 } });

    const written = JSON.parse(mockWriteFile.mock.calls[0]![3]!) as Record<string, unknown>;
    const stab = written['stabilization'] as Record<string, unknown>;
    expect(stab['requiredMatches']).toBe(5);
    expect(stab['minScreenshotsCount']).toBe(6);
  });

  it('writes no trailing newline', async () => {
    const sim = await createRunnerSim({ device: makeDevice(), packageName: PKG });
    await sim.writeConfig();

    const raw = mockWriteFile.mock.calls[0]![3]!;
    expect(raw.endsWith('\n')).toBe(false);
  });
});

// ── Test 7: createRunnerSim clears protocol.sherlo + log.sherlo on creation ───

describe('createRunnerSim()', () => {
  it('deletes protocol.sherlo and log.sherlo to ensure a clean slate', async () => {
    await createRunnerSim({ device: makeDevice(), packageName: PKG });

    expect(mockDeleteFile).toHaveBeenCalledWith(SERIAL, PKG, 'protocol.sherlo');
    expect(mockDeleteFile).toHaveBeenCalledWith(SERIAL, PKG, 'log.sherlo');
    expect(mockDeleteFile).toHaveBeenCalledTimes(2);
  });

  it('does not throw when deleteFile fails (files already absent)', async () => {
    mockDeleteFile.mockImplementation(() => { throw new Error('No such file'); });

    await expect(createRunnerSim({ device: makeDevice(), packageName: PKG })).resolves.toBeDefined();
  });
});
