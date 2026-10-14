/**
 * A `--platform` JOB WITH NOTHING TO TEST ENDS AT ONCE, GREEN.
 *
 * Every team gets one CI workflow with an Android job and an iOS job. An Android-only team's iOS
 * job still runs, so when the config names no device of the job's platform, `sherlo test` prints
 * the platform's one row - `🍎 iOS      ✔ Skipped: sherlo.config.json lists no iOS device` - and
 * exits 0 before it reads a credential: it joins no run and uploads nothing, so the
 * other job's run never waits for a platform that will never come.
 *
 * Only a config that names devices, none of them on this platform, ends here. A config with no
 * devices at all, or with devices the tool does not know, goes on to the ordinary checks, which
 * refuse it in their own words.
 */
import type { Platform } from '@sherlo/api-types';
import getPlatformsToTest from '../../helpers/getPlatformsToTest';
import getNormalizedConfig from '../../helpers/getValidatedCommandParams/getNormalizedConfig';
import getNormalizedOptions from '../../helpers/getValidatedCommandParams/getNormalizedOptions';
import getOptionsWithDefaults from '../../helpers/getValidatedCommandParams/getOptionsWithDefaults';
import { emit } from '../../helpers/transcriptSink';
import type { Config, Options } from '../../types';
import { THIS_COMMAND } from './constants';

/**
 * True when this run is a `--platform` job whose config tests nothing on that platform - and then
 * the line is already printed, and the caller ends the run.
 */
export function endsAsPlatformNotInConfig(passedOptions: Options<THIS_COMMAND>): boolean {
  const askedPlatform = (passedOptions as { platform?: Platform }).platform;
  if (!askedPlatform) return false;

  const options = getNormalizedOptions(getOptionsWithDefaults(passedOptions));
  const { devices } = getNormalizedConfig(options) as Partial<Config>;
  if (!Array.isArray(devices)) return false;

  const configuredPlatforms = getPlatformsToTest(devices);
  if (configuredPlatforms.length === 0) return false;
  if (configuredPlatforms.includes(askedPlatform)) return false;

  emit({
    kind: 'platform-row',
    row: { platform: askedPlatform, appBuild: 'skipped-not-in-config' },
  });
  return true;
}
