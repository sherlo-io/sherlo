import { describe, expect, it } from 'vitest';
import { foldAndroidBuild, foldIosBuild } from '../foldNativeBuilds';

describe('a native build a push was handed folds to a placeholder', () => {
  it('folds an Android build path and then its bare file name', () => {
    expect(foldAndroidBuild('--android-path /tmp/x/app.apk and app.apk')).toBe(
      '--android-path <SHERLO_ANDROID_BUILD_PATH> and <SHERLO_ANDROID_BUILD_FILE_NAME>'
    );
  });

  it('folds an iOS build but leaves Xcode where it is installed', () => {
    expect(foldIosBuild('/tmp/x/app.tar.gz in /Applications/Xcode.app')).toBe(
      '<SHERLO_IOS_BUILD_PATH> in /Applications/Xcode.app'
    );
  });
});
