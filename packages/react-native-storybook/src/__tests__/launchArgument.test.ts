/**
 * A scene's first launch, and the reloads after it (../sealedCore/loadSealedCore).
 *
 * A launch handed the capture argument - `-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on
 * Android - starts in testing mode for `sherlo capture`, on that story, before any JavaScript runs.
 * No native code runs here, so its rules are read from the native source, as nativeLinking.test.ts
 * reads it. A reload the core asks for runs for real against the fake core.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SealedCoreHost } from '../sealedCore/seam';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const ANDROID_SOURCE_DIR = path.join(
  SDK_ROOT,
  'android/src/main/java/io/sherlo/storybookreactnative'
);

/**
 * The body of the method that `signature` opens, to its closing brace: at the line's start in
 * Objective-C, four spaces in in Java, where a method sits inside its class.
 */
function methodBody(source: string, signature: RegExp, closingIndent: '' | '    ' = ''): string {
  const start = source.search(signature);
  expect(start, String(signature)).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('\n' + closingIndent + '}\n') + closingIndent.length + 3);
}

/** The host the SDK installed the fake core with, from a fresh import. */
async function hostOfAFreshCore(): Promise<SealedCoreHost> {
  vi.resetModules();
  const { getSealedCore } = await import('../sealedCore/loadSealedCore');
  expect(getSealedCore()).not.toBeNull();
  return (globalThis as { __SHERLO_CORE__?: { installedWith?: SealedCoreHost } }).__SHERLO_CORE__!
    .installedWith!;
}

describe('the native side starts capture from a launch argument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (globalThis as { __SHERLO_CORE__?: unknown }).__SHERLO_CORE__;
  });

  it('the capture launch argument turns capture mode on at start', () => {
    // iOS: a launch with no runner address reads -sherloCapture as the module starts, in a debug
    // build only, and starts in testing mode driven by the capture, on the story it names.
    const ios = fs.readFileSync(path.join(SDK_ROOT, 'ios', 'SherloModuleCore.m'), 'utf8');
    expect(ios).toContain('CAPTURE_ARGUMENT = @"-sherloCapture"');
    const init = methodBody(ios, /^- \(instancetype\)init \{/m);
    expect(init).toMatch(
      /if \(addressHandedAtLaunch\) \{[\s\S]*\} else \{\s*\[SherloModuleCore startFromCaptureHandedAtLaunch\];/
    );
    const iosStart = methodBody(ios, /^\+ \(void\)startFromCaptureHandedAtLaunch \{/m);
    expect(iosStart).toMatch(/^#if DEBUG\n[\s\S]*^#endif$/m);
    expect(iosStart).toContain('NSProcessInfo.processInfo.arguments');
    // One helper sets the mode, the driver and the kept story; the capture's own move uses it too.
    expect(iosStart).toContain('[SherloModuleCore startCaptureTestingOn:');
    const iosKeep = methodBody(ios, /^\+ \(void\)startCaptureTestingOn:\(NSString \*\)storyId \{/m);
    expect(iosKeep).toContain('currentMode = MODE_TESTING;');
    expect(iosKeep).toContain('driver = DRIVER_CAPTURE;');
    expect(iosKeep).toContain('@"nextSnapshot": @{ @"storyId": storyId }');
    expect(methodBody(ios, /^- \(void\)openTesting:\(RCTBridge \*\)bridge/m)).toContain(
      '[SherloModuleCore startCaptureTestingOn:storyId]'
    );

    // Android: the first activity's intent carries the extra; a debuggable build only, and never
    // over a mode kept across the SDK's own restart.
    const provider = fs.readFileSync(
      path.join(ANDROID_SOURCE_DIR, 'SherloInitProvider.java'),
      'utf8'
    );
    expect(provider).toContain('CAPTURE_EXTRA = "sherloCapture"');
    expect(provider).toMatch(
      /intent\.hasExtra\(CAPTURE_EXTRA\)\) \{\s*SherloModuleCore\.startFromCaptureHandedAtLaunch\(\s*ctx, intent\.getStringExtra\(CAPTURE_EXTRA\)\);/
    );
    const androidCore = fs.readFileSync(
      path.join(ANDROID_SOURCE_DIR, 'SherloModuleCore.java'),
      'utf8'
    );
    const androidStart = methodBody(
      androidCore,
      /public static void startFromCaptureHandedAtLaunch\(Context context, String storyId\) \{/,
      '    '
    );
    expect(androidStart).toMatch(/FLAG_DEBUGGABLE\) != 0;\s*if \(!debuggable\) return;/);
    expect(androidStart).toContain('if (modeKeptAcrossRestart) return;');
    expect(androidStart).toContain('startCaptureTestingOn(storyId);');
    const androidKeep = methodBody(
      androidCore,
      /private static void startCaptureTestingOn\(String storyId\) \{/,
      '    '
    );
    expect(androidKeep).toContain('nextSnapshot.put("storyId", storyId);');
    expect(androidKeep).toContain('currentMode = MODE_TESTING;');
    expect(androidKeep).toContain('driver = DRIVER_CAPTURE;');
    expect(androidCore.split('startCaptureTestingOn(storyId);').length - 1).toBe(2);
  });

  it('a reload asked within 100 ms of start waits until JS is idle', async () => {
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => idleCallbacks.push(callback));
    const host = await hostOfAFreshCore();
    // The fresh import's own native module: the one the host calls through.
    const SherloModule = (await import('../SherloModule')).default;
    const reloadJavaScript = vi.spyOn(SherloModule, 'reloadJavaScript');
    const openTesting = vi.spyOn(SherloModule, 'openTesting');

    // Asked as the JavaScript starts, before it ever went idle.
    host.native.reloadJavaScript();
    host.native.openTesting('scene--chat-list', {} as never);
    expect(reloadJavaScript).not.toHaveBeenCalled();
    expect(openTesting).not.toHaveBeenCalled();

    for (const callback of idleCallbacks) callback();
    expect(reloadJavaScript).toHaveBeenCalledTimes(1);
    expect(openTesting).toHaveBeenCalledWith('scene--chat-list', {});

    // A runtime with no idle callback still lets the JavaScript running now finish first.
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    host.native.reloadJavaScript();
    expect(reloadJavaScript).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(reloadJavaScript).toHaveBeenCalledTimes(2);
  });
});
