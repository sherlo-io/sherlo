/**
 * THE PHONE SIDES OF A PUSH - one per platform it uploads, built from what the project already
 * tells the CLI: the base fingerprint's autolinked modules, the app's id (../seams/deviceStateAppId)
 * and the SDK's sherlo-core.js as the installed package carries it.
 *
 * Bail-open and silent: a platform missing any input gets no phone side and the push goes on as
 * before. No line is printed, so a push's screen is the same with or without one.
 */
import fs from 'fs';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { findSdkPackageJsonPath } from '../commands/test/readBundledSdkProtocolVersion';
import { appIdOf } from '../seams/deviceStateAppId';
import { buildPhoneSide, type PhoneSide } from '../seams/phoneSide';
import type { BaseFingerprints } from './fingerprint';

/** Where the installed SDK package lays sherlo-core.js, per platform (scripts/packSealedCore.js). */
const CORE_PATH_IN_SDK: Record<Platform, string> = {
  ios: 'ios/Resources/assets/sherlo-core.js',
  android: 'android/src/main/assets/sherlo-core.js',
};

export function phoneSidesOf(
  projectRoot: string,
  platforms: Platform[],
  fingerprints: BaseFingerprints
): Partial<Record<Platform, PhoneSide>> {
  const sdkPackageJson = findSdkPackageJsonPath(projectRoot);
  const phoneSides: Partial<Record<Platform, PhoneSide>> = {};

  for (const platform of platforms) {
    const appIdentity = appIdOf(platform, projectRoot);
    const corePath =
      sdkPackageJson && path.join(path.dirname(sdkPackageJson), CORE_PATH_IN_SDK[platform]);
    const coreSource =
      corePath && fs.existsSync(corePath) ? fs.readFileSync(corePath, 'utf8') : undefined;
    const preimage = fingerprints[platform].preimage;

    if (!appIdentity || !coreSource || !preimage) continue;

    phoneSides[platform] = buildPhoneSide({
      platform,
      autolinkedModules: preimage.autolinkedModules,
      appIdentity,
      coreSource,
    });
  }
  return phoneSides;
}
