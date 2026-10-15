import { afterEach, describe, expect, it } from 'vitest';
import stripAnsi from '../../../../helpers/stripAnsi';
import type { BaseFingerprintPreimage } from '../../../../helpers/fingerprint/baseFingerprint';
import { renderNativeChanges } from '../../../../render/appBuild';
import { installAppBuilder, liveAppBuilder } from '../../../../seams/appBuilder';
import type { NativeFolderFile, StoredBaseSources } from '../../../../seams/serverCalls';
import { changesSinceStoredBuild, nativeChangesSince } from '../nativeChanges';

const PROJECT_ROOT = '/project';

function thisRun(overrides: Partial<BaseFingerprintPreimage> = {}): BaseFingerprintPreimage {
  return {
    workflow: 'bare',
    nativeSources: [],
    lockfiles: [],
    autolinkedModules: [],
    nativeFolderFiles: [],
    ...overrides,
  } as BaseFingerprintPreimage;
}

function stored(overrides: Partial<StoredBaseSources> = {}): StoredBaseSources {
  return { buildIndex: 12, sources: [], modules: [], ...overrides };
}

/** The lines the build line prints under it, without colour. */
function printed(changes: Parameters<typeof renderNativeChanges>[0]): string[] {
  return renderNativeChanges(changes).map(stripAnsi);
}

let restoreAppBuilder: (() => void) | undefined;
afterEach(() => restoreAppBuilder?.());

function hashingThisRunFolderFilesAs(files: NativeFolderFile[]) {
  restoreAppBuilder = installAppBuilder({
    ...liveAppBuilder,
    hashNativeFolderFiles: async () => files,
  });
}

describe('the build line lists the native changes', () => {
  it('when native code changed, counts and lists the changes since the stored app build under the build line', () => {
    const changes = nativeChangesSince(
      stored({
        sources: [{ path: 'app.json', hash: 'old', kind: 'file' }],
        modules: [
          { name: 'react-native-maps', version: '1.2.0' },
          { name: 'react-native-svg', version: '15.0.0' },
        ],
      }),
      thisRun({
        nativeSources: [{ type: 'file', id: 'app.json', hash: 'new' }],
        lockfiles: [{ file: 'yarn.lock', digest: 'lock' }],
        autolinkedModules: ['react-native-svg@15.1.0'],
      }),
      []
    );

    expect(printed(changes)).toEqual([
      '   ~ app.json',
      '   + yarn.lock',
      '   - react-native-maps 1.2.0',
      '   ~ react-native-svg 15.0.0 → 15.1.0',
    ]);
  });

  it('lists at most eight native changes and counts the rest as and N more', () => {
    const lockfiles = Array.from({ length: 11 }, (_, index) => ({
      file: `lock-${String(index).padStart(2, '0')}.lock`,
      digest: 'new',
    }));

    const lines = printed(nativeChangesSince(stored(), thisRun({ lockfiles }), []));

    expect(lines).toHaveLength(9);
    expect(lines[7]).toBe('   + lock-07.lock');
    expect(lines[8]).toBe('   and 3 more');
  });

  it("names the changed file inside a bare project's native folder, from per-file hashes kept for the list alone", () => {
    const changes = nativeChangesSince(
      stored({
        sources: [
          {
            path: 'android',
            hash: 'folder-old',
            kind: 'dir',
            files: [
              { path: 'android/app/build.gradle', hash: 'a' },
              { path: 'android/settings.gradle', hash: 'b' },
            ],
          },
        ],
      }),
      thisRun({ nativeSources: [{ type: 'dir', id: 'android', hash: 'folder-new' }] }),
      [
        { path: 'android/app/build.gradle', hash: 'changed' },
        { path: 'android/settings.gradle', hash: 'b' },
      ]
    );

    expect(printed(changes)).toEqual(['   ~ android/app/build.gradle']);
  });

  it('a native folder stored without its files is listed as the folder', () => {
    const changes = nativeChangesSince(
      stored({ sources: [{ path: 'ios', hash: 'folder-old', kind: 'dir' }] }),
      thisRun({ nativeSources: [{ type: 'dir', id: 'ios', hash: 'folder-new' }] }),
      []
    );

    expect(printed(changes)).toEqual(['   ~ ios']);
  });

  it('with nothing stored, or a stored app build with no source list, the build line lists no changes', async () => {
    hashingThisRunFolderFilesAs([]);

    expect(
      await changesSinceStoredBuild({
        storedBase: undefined,
        fingerprintPreimage: thisRun(),
        projectRoot: PROJECT_ROOT,
      })
    ).toEqual({});
    expect(
      await changesSinceStoredBuild({
        storedBase: stored(),
        fingerprintPreimage: undefined,
        projectRoot: PROJECT_ROOT,
      })
    ).toEqual({});
  });
});
