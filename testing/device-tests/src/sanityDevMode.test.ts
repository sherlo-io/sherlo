import * as path from 'node:path';
import { existsSync } from 'node:fs';
import {
  dumpViewHierarchy,
  forceStop,
  installFresh,
  launch,
  soleReadyDeviceSerial,
  tap,
} from './adb';
import { startLogCapture, type LogCapture } from './logcat';

// ===========================================================================
// DEVELOPER MODE, END TO END, ON A REAL DEVICE.
// ===========================================================================
//
// Install the app with nothing injected, press "Open Storybook" the way a
// developer would, and check both signals:
//
//   POSITIVE - a story actually reached the screen. Nothing else in the repo
//   can prove that: every node-level suite stops at the Metro config or the
//   module graph, and a build can succeed while Storybook never renders (a
//   dropped require.context flag, a wrapper that no-ops, a native module that
//   never reports storybook mode).
//
//   NEGATIVE - not one Sherlo diagnostic line reached the log. Developer mode
//   is not a Sherlo run, and a developer's console is theirs.
// ===========================================================================

const APP_PACKAGE = 'com.sherlo.example';
const APP_ACTIVITY = '.MainActivity';

const OPEN_STORYBOOK_LABEL = 'Open Storybook';

/**
 * Logged by every story render, from the global decorator in
 * `testing/expo/.rnstorybook/preview.ts`. The literal lives on both sides
 * because a release bundle cannot import from this suite - keep them equal.
 */
const STORY_RENDERED_MARKER = '[SHERLO_STORY_RENDERED]';

/**
 * Diagnostic traces that have no business in a developer session. Matched
 * case-sensitively and deliberately: the native module's own operational tags
 * (`SherloModule:`, `SherloInitProvider`) are emitted on every launch by
 * design, in developer mode as much as in a capture run, and are not what
 * this looks for.
 */
const DIAGNOSTIC_MARKERS = ['[Sherlo]', 'DIAG_', 'runtime-init'];

const HOME_SCREEN_TIMEOUT_MS = 90_000;
const STORY_RENDER_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

const APK_PATH = path.resolve(
  process.env.SHERLO_APK_PATH ?? path.join(__dirname, '../../expo/builds/preview/android.apk')
);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Centre of the first node whose `text` attribute is exactly `label`, or null. */
function nodeCentre(viewHierarchy: string, label: string): { x: number; y: number } | null {
  const nodePattern = new RegExp(
    `<node[^>]*text="${label}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
  );
  const bounds = viewHierarchy.match(nodePattern);
  if (!bounds) return null;

  const [left, top, right, bottom] = bounds.slice(1, 5).map(Number) as [
    number,
    number,
    number,
    number
  ];
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

async function waitForNodeCentre(
  serial: string,
  label: string,
  timeoutMs: number
): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + timeoutMs;
  let lastHierarchy = '';

  while (Date.now() < deadline) {
    lastHierarchy = dumpViewHierarchy(serial);
    const centre = nodeCentre(lastHierarchy, label);
    if (centre) return centre;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `no node with text "${label}" appeared within ${timeoutMs}ms.\n` +
      `Last view hierarchy (first 3000 chars):\n${lastHierarchy.slice(0, 3000)}`
  );
}

async function waitForLoggedLine(
  logCapture: LogCapture,
  marker: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (logCapture.lines().some((line) => line.includes(marker))) return true;
    await sleep(500);
  }
  return false;
}

describe('developer mode - the app opens Storybook and says nothing else', () => {
  let serial: string;
  let logCapture: LogCapture;

  beforeAll(async () => {
    if (!existsSync(APK_PATH)) {
      throw new Error(
        `no APK at ${APK_PATH}. Build testing/expo for the preview profile, or point ` +
          'SHERLO_APK_PATH at a build.'
      );
    }

    serial = soleReadyDeviceSerial();
    installFresh(serial, APK_PATH, APP_PACKAGE);

    // Capture from before the launch, so early initialisation output is in it.
    logCapture = startLogCapture(serial);
    launch(serial, APP_PACKAGE, APP_ACTIVITY);
  }, 10 * 60_000);

  afterAll(() => {
    logCapture?.stop();
    forceStop(serial, APP_PACKAGE);
  });

  it('renders a story after "Open Storybook", with no diagnostic line in the log', async () => {
    const button = await waitForNodeCentre(serial, OPEN_STORYBOOK_LABEL, HOME_SCREEN_TIMEOUT_MS);
    tap(serial, button.x, button.y);

    // openStorybook() switches the mode AND reloads, so the story renders on
    // the other side of a fresh bundle evaluation.
    const storyRendered = await waitForLoggedLine(
      logCapture,
      STORY_RENDERED_MARKER,
      STORY_RENDER_TIMEOUT_MS
    );
    const capturedLines = logCapture.lines();

    expect(
      storyRendered,
      `${STORY_RENDERED_MARKER} never appeared, so no story rendered. Either the tap missed, ` +
        'openStorybook() did not fire, or Storybook did not come up in the reloaded ' +
        `bundle.\n\nCaptured log:\n${capturedLines.join('\n')}`
    ).toBe(true);

    const diagnosticLines = capturedLines.filter((line) =>
      DIAGNOSTIC_MARKERS.some((marker) => line.includes(marker))
    );
    expect(
      diagnosticLines,
      'Sherlo diagnostic output leaked into a developer session - developer mode is not a ' +
        `Sherlo run, and the console belongs to the developer:\n${diagnosticLines.join('\n')}`
    ).toHaveLength(0);
  });
});
