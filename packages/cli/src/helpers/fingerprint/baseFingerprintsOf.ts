import type { Platform } from '@sherlo/api-types';
import type { BaseFingerprints } from './baseFingerprint';

/** The hash of each of `platforms` whose base fingerprint could be computed. */
export function baseFingerprintsOf(
  fingerprints: BaseFingerprints,
  platforms: Platform[]
): Partial<Record<Platform, string>> {
  const hashes: Partial<Record<Platform, string>> = {};
  for (const platform of platforms) {
    const hash = fingerprints[platform].hash;
    if (hash) hashes[platform] = hash;
  }
  return hashes;
}
