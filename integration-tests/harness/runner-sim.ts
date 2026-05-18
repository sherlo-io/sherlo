import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { adbBinary, shell } from './adb.js';
import type { TailToken } from './device-files.js';
import type { Device, LogTailer } from './device.js';
import type { ProtocolFile } from './device-files.js';

export interface Snapshot {
  storyId: string;
  parameters?: Record<string, unknown>;
}

export interface ProtocolEntry {
  action: string;
  [key: string]: unknown;
}

export interface WriteConfigOptions {
  stabilization?: Partial<{
    requiredMatches: number;
    minScreenshotsCount: number;
    intervalMs: number;
    timeoutMs: number;
    saveScreenshots: boolean;
    threshold: number;
    includeAA: boolean;
  }>;
  initialStoryRenderDelayMs?: number;
  inspect?: { initialStoryId?: string };
}

export interface RunnerSim {
  /** Wait for a JSONL line whose action === 'START'. Returns its payload. */
  expectStart(timeoutMs?: number): Promise<ProtocolEntry>;

  /** Append ACK_START with the given nextSnapshot. */
  ackStart(nextSnapshot: Snapshot | null): Promise<void>;

  /** Wait for next REQUEST_SNAPSHOT. Returns payload (includes hasError, inspectorData, etc.). */
  expectRequestSnapshot(timeoutMs?: number): Promise<ProtocolEntry>;

  /** Append ACK_REQUEST_SNAPSHOT with nextSnapshot (null to end the session). */
  ackRequestSnapshot(nextSnapshot: Snapshot | null): Promise<void>;

  /** Wait for the SDK to indicate the storyId is displayed in log.sherlo. */
  waitForStoryDisplayed(storyId: string, timeoutMs?: number): Promise<void>;

  /** Read full log.sherlo contents (for assertions / debug). */
  readLog(): string;

  /** Read full protocol.sherlo (for assertions / debug). */
  readProtocol(): ProtocolEntry[];

  /**
   * Append a raw string (possibly malformed JSON) to protocol.sherlo on device.
   * Caller is responsible for including a trailing newline if desired.
   * Used for protocol-resilience tests.
   */
  appendRawToProtocol(rawString: string): Promise<void>;

  /** Initial setup: writes a fresh config.sherlo to the device. Merges with runner defaults. */
  writeConfig(config?: WriteConfigOptions): Promise<void>;

  /**
   * Pre-inject ACK_START + ACK_REQUEST_SNAPSHOT into protocol.sherlo BEFORE launching the app.
   * The native bridge reads these on boot and exposes lastState, so the SDK renders the
   * specified story without going through the discovery (START) flow.
   * Must be called after createRunnerSim (which clears protocol.sherlo) and before device.start().
   */
  preInjectStory(storyId: string, opts?: { parameters?: Record<string, unknown> }): Promise<void>;

  /**
   * Full single-story capture cycle matching production runner behavior:
   * writeConfig → preInjectStory → device.start → expectRequestSnapshot → ackRequestSnapshot → killApp.
   * Returns the REQUEST_SNAPSHOT payload for assertions.
   */
  captureStory(storyId: string, opts?: { configOverrides?: WriteConfigOptions; timeoutMs?: number }): Promise<ProtocolEntry>;

  /**
   * Drive the long-screenshot multi-chunk flow for one story in one app session.
   * Launches the app, reads the first REQUEST_SNAPSHOT, then while !isAtEnd
   * sends ACK_SCROLL_REQUEST and reads the next REQUEST_SNAPSHOT. Stops when
   * `isAtEnd` is true or the runner safety cap (`maxChunks`) is hit.
   * Returns the ordered list of REQUEST_SNAPSHOT entries the SDK produced.
   */
  captureLongScreenshot(
    storyId: string,
    opts?: { configOverrides?: WriteConfigOptions; timeoutMs?: number; maxChunks?: number }
  ): Promise<ProtocolEntry[]>;

  /**
   * Append a runner-style ACK_SCROLL_REQUEST to the protocol file. Mirrors the
   * shape produced by sherlo-runner's sendAck.ts (action + scrollIndex +
   * offsetPx + requestId + runner-telemetry fields). The SDK adopts the
   * `requestId` for the next REQUEST_SNAPSHOT in the chain.
   */
  ackScrollRequest(args: { scrollIndex: number; offsetPx: number; requestId: string }): Promise<void>;
}

const DEFAULT_POLL_MS = 200;
const DEFAULT_TIMEOUT_MS = 30_000;
const LOGCATS_DIR = path.join(__dirname, '..', '.logcats');

const RUNNER_DEFAULT_CONFIG = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 6,
    intervalMs: 500,
    timeoutMs: 20000,
    saveScreenshots: true,
    threshold: 0.02,
    includeAA: true,
  },
  initialStoryRenderDelayMs: 500,
};

let _idCounter = 0;
function nextId(): string {
  return `rq-${++_idCounter}`;
}

function buildNextSnapshotForAck(snap: Snapshot | null): { storyId: string; parameters: { theme: unknown; noSafeArea: unknown } } | undefined {
  if (!snap) return undefined;
  return {
    storyId: snap.storyId,
    parameters: {
      theme: (snap.parameters as any)?.theme,
      noSafeArea: (snap.parameters as any)?.noSafeArea,
    },
  };
}

function ackTelemetryFields(): { time: string; timestamp: number; entity: 'runner' } {
  return {
    time: new Date().toTimeString().split(' ')[0],
    timestamp: Date.now(),
    entity: 'runner',
  };
}

function readTail(
  device: Device,
  packageName: string,
  file: ProtocolFile,
  token: TailToken,
): { lines: string[]; token: TailToken } {
  const content = device.readFile(packageName, file);
  const byteOffset = token.byteOffset;
  const slice = Buffer.from(content, 'utf8').subarray(byteOffset).toString('utf8');
  const lines = slice.split('\n').filter(line => line.length > 0);
  return { lines, token: { byteOffset: Buffer.byteLength(content, 'utf8') } };
}

class RunnerSimImpl implements RunnerSim {
  private nextSnapshotIndex = 0;
  private lastRequestId = '';
  private protocolToken: TailToken = { byteOffset: 0 };

  constructor(
    private readonly device: Device,
    private readonly packageName: string,
    private readonly pollIntervalMs: number,
    private readonly logTailer?: LogTailer,
  ) {}

  private diagnose(): string {
    const { device, packageName } = this;
    const parts: string[] = [];

    // pidof status (Android-specific)
    if (device.platform === 'android') {
      let pidStatus: string;
      try {
        const pid = shell(device.id, `pidof ${packageName}`);
        pidStatus = pid ? `pid: ${pid}` : '(not running)';
      } catch {
        pidStatus = '(unavailable)';
      }
      parts.push(`pidof ${packageName}: ${pidStatus}`);

      let dirListing: string;
      try {
        dirListing = shell(
          device.id,
          `run-as ${packageName} ls -la /data/data/${packageName}/files/sherlo/ 2>&1`,
        ).trim() || '(empty dir or not found)';
      } catch {
        dirListing = '(unavailable)';
      }
      parts.push(`/data/data/${packageName}/files/sherlo/:\n${dirListing}`);
    }

    // log.sherlo contents
    let logContents: string;
    try {
      logContents = device.readFile(packageName, 'log.sherlo').trim() || '(empty)';
    } catch {
      logContents = '(empty)';
    }
    parts.push(`log.sherlo:\n${logContents}`);

    // protocol.sherlo contents
    let protocolContents: string;
    try {
      protocolContents = device.readFile(packageName, 'protocol.sherlo').trim() || '(empty)';
    } catch {
      protocolContents = '(empty)';
    }
    parts.push(`protocol.sherlo:\n${protocolContents}`);

    // logcat / log lines
    let logcatLines: string;
    if (this.logTailer) {
      try {
        const lines = this.logTailer.snapshot().slice(-200);
        logcatLines = lines.join('\n') || '(none)';
      } catch (err: unknown) {
        logcatLines = `(log read failed: ${err instanceof Error ? err.message : String(err)})`;
      }
      parts.push(`recent log (captured, last 200 lines):\n${logcatLines}`);
    } else if (device.platform === 'android') {
      try {
        const output = execFileSync(adbBinary(), ['-s', device.id, 'logcat', '-d', '-v', 'brief'], {
          encoding: 'utf8',
          timeout: 10_000,
        });
        const filtered = output
          .split('\n')
          .filter(l => /sherlo|ReactNativeJS/i.test(l))
          .slice(-200);
        logcatLines = filtered.join('\n') || '(none)';
      } catch (err: unknown) {
        logcatLines = `(unavailable: ${err instanceof Error ? err.message : String(err)})`;
      }
      parts.push(`recent logcat (sherlo|ReactNativeJS, last 200 lines):\n${logcatLines}`);
    }

    return parts.join('\n\n');
  }

  private saveDiagSnapshot(label: string, content: string): void {
    try {
      fs.mkdirSync(LOGCATS_DIR, { recursive: true });
      const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
      const ts = Date.now().toString(36);
      const filePath = path.join(LOGCATS_DIR, `timeout-${safeLabel}-${ts}.log`);
      fs.writeFileSync(filePath, content, 'utf8');
      console.error(`[RunnerSim] Diagnostic snapshot saved to: ${filePath}`);
    } catch { /* best-effort */ }
  }

  /**
   * Generic polling helper. Calls readLines() on each tick and passes each new
   * line to match(). Resolves with the first non-undefined match result.
   * Rejects with a descriptive error on timeout.
   */
  private waitFor<T>(
    label: string,
    readLines: () => string[],
    match: (line: string) => T | undefined,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const seenLines: string[] = [];
      const deadline = Date.now() + timeoutMs;

      const tick = (): void => {
        let newLines: string[] = [];
        try {
          newLines = readLines();
        } catch { /* file may not exist yet */ }

        for (const line of newLines) {
          seenLines.push(line);
          const result = match(line);
          if (result !== undefined) {
            clearInterval(timer);
            resolve(result);
            return;
          }
        }

        if (Date.now() >= deadline) {
          clearInterval(timer);
          const diag = this.diagnose();
          this.saveDiagSnapshot(label, diag);
          reject(
            new Error(
              `RunnerSim: timed out waiting for ${label} after ${timeoutMs}ms\n` +
              `Last lines:\n${seenLines.slice(-5).join('\n') || '(none)'}\n\n` +
              diag,
            ),
          );
        }
      };

      const timer = setInterval(tick, this.pollIntervalMs);
      tick();
    });
  }

  async expectStart(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProtocolEntry> {
    let token = this.protocolToken;

    const result = await this.waitFor(
      'START',
      () => {
        const { lines, token: t } = readTail(this.device, this.packageName, 'protocol.sherlo', token);
        token = t;
        return lines;
      },
      (line) => {
        try {
          const e = JSON.parse(line) as ProtocolEntry;
          return e.action === 'START' ? e : undefined;
        } catch { return undefined; }
      },
      timeoutMs,
    );

    this.protocolToken = token;
    return result;
  }

  async ackStart(nextSnapshot: Snapshot | null): Promise<void> {
    const requestId = nextId();
    this.lastRequestId = requestId;
    const trimmed = buildNextSnapshotForAck(nextSnapshot);
    const entry: Record<string, unknown> = {
      action: 'ACK_START',
      ...ackTelemetryFields(),
      requestId,
      nextSnapshotIndex: nextSnapshot !== null ? this.nextSnapshotIndex : null,
    };
    if (trimmed) entry.nextSnapshot = trimmed;
    if (nextSnapshot !== null) this.nextSnapshotIndex++;
    this.device.appendFile(this.packageName, 'protocol.sherlo', JSON.stringify(entry) + '\n');
  }

  async expectRequestSnapshot(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProtocolEntry> {
    let token = this.protocolToken;

    const result = await this.waitFor(
      'REQUEST_SNAPSHOT',
      () => {
        const { lines, token: t } = readTail(this.device, this.packageName, 'protocol.sherlo', token);
        token = t;
        return lines;
      },
      (line) => {
        try {
          const e = JSON.parse(line) as ProtocolEntry;
          if (e.action === 'REQUEST_SNAPSHOT') {
            if (typeof e['requestId'] === 'string') {
              this.lastRequestId = e['requestId'];
            }
            return e;
          }
          return undefined;
        } catch { return undefined; }
      },
      timeoutMs,
    );

    this.protocolToken = token;
    return result;
  }

  async ackRequestSnapshot(nextSnapshot: Snapshot | null): Promise<void> {
    const trimmed = buildNextSnapshotForAck(nextSnapshot);
    const entry: Record<string, unknown> = {
      action: 'ACK_REQUEST_SNAPSHOT',
      ...ackTelemetryFields(),
      requestId: this.lastRequestId,
      nextSnapshotIndex: nextSnapshot !== null ? this.nextSnapshotIndex : null,
    };
    if (trimmed) entry.nextSnapshot = trimmed;
    if (nextSnapshot !== null) this.nextSnapshotIndex++;
    this.device.appendFile(this.packageName, 'protocol.sherlo', JSON.stringify(entry) + '\n');
  }

  async waitForStoryDisplayed(storyId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    let token: TailToken = { byteOffset: 0 };

    await this.waitFor(
      `story '${storyId}' displayed`,
      () => {
        const { lines, token: t } = readTail(this.device, this.packageName, 'log.sherlo', token);
        token = t;
        return lines;
      },
      // SDK logs 'story is displayed' without storyId in the payload (matches 1.6.3).
      // Each test launches one story at a time so substring match alone is sufficient.
      (line) =>
        line.includes('story is displayed') ? true : undefined,
      timeoutMs,
    );
  }

  readLog(): string {
    return this.device.readFile(this.packageName, 'log.sherlo');
  }

  readProtocol(): ProtocolEntry[] {
    const content = this.device.readFile(this.packageName, 'protocol.sherlo');
    return content
      .split('\n')
      .filter(line => line.trim() !== '')
      .flatMap(line => {
        try { return [JSON.parse(line) as ProtocolEntry]; }
        catch { return []; }
      });
  }

  async appendRawToProtocol(rawString: string): Promise<void> {
    this.device.appendFile(this.packageName, 'protocol.sherlo', rawString);
  }

  async writeConfig(config?: WriteConfigOptions): Promise<void> {
    const merged = {
      ...RUNNER_DEFAULT_CONFIG,
      ...config,
      stabilization: {
        ...RUNNER_DEFAULT_CONFIG.stabilization,
        ...config?.stabilization,
      },
    };
    this.device.writeFile(this.packageName, 'config.sherlo', JSON.stringify(merged));
  }

  async preInjectStory(storyId: string, opts?: { parameters?: Record<string, unknown> }): Promise<void> {
    const r1 = nextId();
    const r2 = nextId();
    const fullSnap: Snapshot = { storyId, parameters: opts?.parameters };
    const trimmed = buildNextSnapshotForAck(fullSnap);

    const ackStartEntry = {
      action: 'ACK_START',
      ...ackTelemetryFields(),
      requestId: r1,
      nextSnapshotIndex: 0,
      nextSnapshot: trimmed,
    };
    const ackReqEntry = {
      action: 'ACK_REQUEST_SNAPSHOT',
      ...ackTelemetryFields(),
      requestId: r2,
      nextSnapshotIndex: 0,
      nextSnapshot: trimmed,
    };
    this.device.appendFile(this.packageName, 'protocol.sherlo', JSON.stringify(ackStartEntry) + '\n');
    this.device.appendFile(this.packageName, 'protocol.sherlo', JSON.stringify(ackReqEntry) + '\n');
  }

  async captureStory(storyId: string, opts?: { configOverrides?: WriteConfigOptions; timeoutMs?: number }): Promise<ProtocolEntry> {
    await this.writeConfig(opts?.configOverrides);
    await this.preInjectStory(storyId);
    this.device.start(this.packageName, '.MainActivity');
    const req = await this.expectRequestSnapshot(opts?.timeoutMs ?? 60_000);
    // Real runner ends sessions by killing the device, not by writing a final
    // ACK. Matching that here so the SDK's getLastState() doesn't pick up a
    // stale "session over" entry from a previous test launch.
    this.device.forceStop(this.packageName);
    return req;
  }

  async ackScrollRequest(args: { scrollIndex: number; offsetPx: number; requestId: string }): Promise<void> {
    const entry = {
      action: 'ACK_SCROLL_REQUEST',
      ...ackTelemetryFields(),
      scrollIndex: args.scrollIndex,
      offsetPx: args.offsetPx,
      requestId: args.requestId,
    };
    this.lastRequestId = args.requestId;
    this.device.appendFile(this.packageName, 'protocol.sherlo', JSON.stringify(entry) + '\n');
  }

  async captureLongScreenshot(
    storyId: string,
    opts?: { configOverrides?: WriteConfigOptions; timeoutMs?: number; maxChunks?: number }
  ): Promise<ProtocolEntry[]> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const maxChunks = opts?.maxChunks ?? 25;

    await this.writeConfig(opts?.configOverrides);
    await this.preInjectStory(storyId);
    this.device.start(this.packageName, '.MainActivity');

    const chunks: ProtocolEntry[] = [];
    let req = await this.expectRequestSnapshot(timeoutMs);
    chunks.push(req);

    while (!(req as any).isAtEnd && chunks.length < maxChunks) {
      const scrollViewFrame = (req as any).scrollViewFrame;
      if (!scrollViewFrame) {
        throw new Error(
          `captureLongScreenshot: chunk ${chunks.length - 1} for storyId='${storyId}' missing scrollViewFrame - story is not scrollable.`,
        );
      }
      const offsetPx = Math.floor((scrollViewFrame.height as number) * 0.5);
      const scrollIndex = chunks.length;
      const newRequestId = nextId();
      await this.ackScrollRequest({ scrollIndex, offsetPx, requestId: newRequestId });

      req = await this.expectRequestSnapshot(timeoutMs);
      chunks.push(req);
    }

    // Final ACK ends the session (matches captureStory's contract).
    await this.ackRequestSnapshot(null);
    this.device.forceStop(this.packageName);
    return chunks;
  }
}

/**
 * Create a runner simulator bound to a specific app on a specific device.
 * Clears existing protocol/log files on creation (clean slate).
 */
export async function createRunnerSim(opts: {
  device: Device;
  packageName: string;
  pollIntervalMs?: number;
  logTailer?: LogTailer;
}): Promise<RunnerSim> {
  const { device, packageName, pollIntervalMs = DEFAULT_POLL_MS, logTailer } = opts;

  try { device.deleteFile(packageName, 'protocol.sherlo'); } catch { /* absent */ }
  try { device.deleteFile(packageName, 'log.sherlo'); } catch { /* absent */ }

  // The error-incompatible-sdk variant's prepare.sh patches sdk-compatibility.json
  // inside node_modules to require native version 999.0.0. resetFixture() doesn't
  // undo node_modules mutations, so subsequent buildApp() calls embed the wrong
  // version in the JS bundle. Restore the correct content here before each test.
  const sdkCompatPath = path.join(
    __dirname, '..', 'apps', 'integrated-app-bare-rn',
    'node_modules', '@sherlo', 'react-native-storybook', 'dist', 'sdk-compatibility.json',
  );
  try {
    const current = fs.readFileSync(sdkCompatPath, 'utf8');
    if (current.includes('"REQUIRED_MIN_NATIVE_VERSION":"999.0.0"')) {
      fs.writeFileSync(sdkCompatPath, JSON.stringify({
        REQUIRED_MIN_NATIVE_VERSION: '1.6.3',
        JS_MODULE_VERSION: '1.6.4-alpha.1',
      }, null, 4) + '\n', 'utf8');
    }
  } catch { /* best-effort */ }

  return new RunnerSimImpl(device, packageName, pollIntervalMs, logTailer);
}
