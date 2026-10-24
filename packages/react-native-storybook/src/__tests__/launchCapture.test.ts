/**
 * A scene the cloud run launches: the launch carries the runner's address and the scene's id
 * (`-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on Android). No native code runs here,
 * so the decision is read from the native source, as launchArgument.test.ts reads it.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SDK_ROOT = path.resolve(__dirname, '..', '..');
const ANDROID_DIR = path.join(SDK_ROOT, 'android/src/main/java/io/sherlo/storybookreactnative');

function body(source: string, signature: RegExp, closingIndent: '' | '    ' = ''): string {
  const start = source.search(signature);
  expect(start, String(signature)).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('\n' + closingIndent + '}\n') + closingIndent.length + 3);
}

describe('a scene launch', () => {
  it("a launch that carries the runner's address and a scene id opens that scene in capture mode", () => {
    // iOS: with the address, the runner keeps driving and the scene id is the story kept.
    const ios = fs.readFileSync(path.join(SDK_ROOT, 'ios', 'SherloModuleCore.m'), 'utf8');
    const init = body(ios, /^- \(instancetype\)init \{/m);
    expect(init).toMatch(
      /if \(addressHandedAtLaunch\) \{[\s\S]*driver = DRIVER_RUNNER;[\s\S]*\[SherloModuleCore keepStory:\[SherloModuleCore captureArgument\]\];[\s\S]*\} else \{/
    );
    // The argument is read in one place, and it needs no debug build once the address is there.
    expect(ios.split('indexOfObject:CAPTURE_ARGUMENT').length - 1).toBe(1);
    expect(body(ios, /^\+ \(void\)keepStory:\(NSString \*\)storyId \{/m)).toContain(
      '@"nextSnapshot": @{ @"storyId": storyId }'
    );

    // Android: the same extra feeds the address path; one keepStory holds the story.
    const provider = fs.readFileSync(path.join(ANDROID_DIR, 'SherloInitProvider.java'), 'utf8');
    expect(provider).toMatch(/startFromAddressHandedAtLaunch\(address, captureId\);/);
    expect(provider).toContain('intent.getStringExtra(CAPTURE_EXTRA)');
    const core = fs.readFileSync(path.join(ANDROID_DIR, 'SherloModuleCore.java'), 'utf8');
    const start = body(
      core,
      /public static void startFromAddressHandedAtLaunch\(String address, String sceneId\) \{/,
      '    '
    );
    expect(start).toMatch(/startTestingRun\(address\);[\s\S]*keepStory\(sceneId\);/);
    expect(body(core, /private static void keepStory\(String storyId\) \{/, '    ')).toContain(
      'nextSnapshot.put("storyId", storyId);'
    );
  });

  it('a launch with only the address keeps the story path', () => {
    const ios = fs.readFileSync(path.join(SDK_ROOT, 'ios', 'SherloModuleCore.m'), 'utf8');
    expect(body(ios, /^\+ \(void\)keepStory:\(NSString \*\)storyId \{/m)).toContain(
      'if (storyId.length == 0) return;'
    );
    const core = fs.readFileSync(path.join(ANDROID_DIR, 'SherloModuleCore.java'), 'utf8');
    expect(body(core, /private static void keepStory\(String storyId\) \{/, '    ')).toContain(
      'if (storyId == null || storyId.isEmpty()) return;'
    );
  });
});
