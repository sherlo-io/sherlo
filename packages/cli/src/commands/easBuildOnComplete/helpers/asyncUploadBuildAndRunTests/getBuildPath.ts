import { Platform } from '@sherlo/api-types';
import fg from 'fast-glob';
import fs from 'fs';
import { join } from 'path';
import { getCwd, getErrorWithCustomMessage, throwError } from '../../../../helpers';

/**
 * WHERE EAS LEFT THE APP BUILD, read the way EAS itself reads it (epic sherlo-test-builds-apps,
 * operator decision 2026-10-11): a profile's `applicationArchivePath` is a path OR A PATTERN
 * ("EAS Build uses glob patterns for pattern matching", docs.expo.dev/eas/json), so it is matched,
 * never only checked for existence. With none, the pattern is EAS's own default for the build
 * Sherlo asks for - an APK on Android, a simulator app on iOS, in whichever configuration the
 * profile built (`*-iphonesimulator`, not only `Release-iphonesimulator`).
 *
 * The first match, in path order, is the app build. The pattern is matched in the project folder
 * the hook runs in (the project-folder seam): the same folder on EAS, the posed folder in a pose.
 */
const DEFAULT_ARCHIVE_PATTERN: Record<Platform, string> = {
  // https://docs.expo.dev/build-reference/android-builds/ - EAS's default also takes an .aab, which
  // no Sherlo device installs, so only the APK is looked for.
  android: 'android/app/build/outputs/**/*.apk',
  // https://docs.expo.dev/build-reference/ios-builds/ - the simulator default.
  ios: 'ios/build/Build/Products/*-iphonesimulator/*.app',
};

function getBuildPath({
  easBuildProfile,
  platform,
}: {
  easBuildProfile: string;
  platform: Platform;
}): string {
  if (platform !== 'android' && platform !== 'ios') {
    throwError({
      type: 'unexpected',
      error: new Error(`Unsupported platform: ${platform}`),
    });
  }

  const archivePattern =
    getArchivePathFromEasJson({ easBuildProfile, platform }) ?? DEFAULT_ARCHIVE_PATTERN[platform];

  // An iOS app build is a folder, so folders are matched as well as files.
  const [firstMatch] = fg.sync(archivePattern, { cwd: getCwd(), onlyFiles: false, dot: true }).sort();

  if (!firstMatch) {
    throwError({
      type: 'unexpected',
      error: new Error(`Build file does not exist at path: ${archivePattern}`),
    });
  }

  return firstMatch;
}

export default getBuildPath;

/* ========================================================================== */

function getArchivePathFromEasJson({
  easBuildProfile,
  platform,
}: {
  easBuildProfile: string;
  platform: Platform;
}): string | null {
  const easJsonPath = join(getCwd(), 'eas.json');

  let easJsonData;
  try {
    easJsonData = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid ${easJsonPath}`),
    });
  }

  // eas.json nests a profile's settings as `build.<profile>.<platform>`: the hook used to read
  // `builds.<platform>.<profile>`, which no eas.json has, so a profile's own archive path was never
  // found and the default path was always used (Sherlo 3 audit).
  return easJsonData?.build?.[easBuildProfile]?.[platform]?.applicationArchivePath ?? null;
}
