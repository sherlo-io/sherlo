import { PLATFORM_OPTION } from '../commands/test/appBuild/buildSettings';
import { ANDROID_OPTION, IOS_OPTION, TOKEN_OPTION } from '../constants';
import { renderBinaryPathFlagGone, renderPlatformUnknown } from '../render/appBuild';
import { renderTokenGone } from '../render/pushCredential';
import throwError from './throwError';

/**
 * Sherlo 3 takes a push's credential from SHERLO_TOKEN or the saved login only, so a token on the command line is refused before anything runs - exit 1, naming the
 * two that remain. The same words refuse a `token` in sherlo.config.json (resolvePushCredential).
 *
 * `sherlo init --token` keeps its flag.
 */
export function refuseTokenFlag(command: string, options: { [TOKEN_OPTION]?: string }) {
  if (options[TOKEN_OPTION] === undefined) return;

  throwError(renderTokenGone(command));
}

/**
 * `--platform` names one of the two platforms, or is left out for both. Any other value is refused
 * before anything runs - exit 1, naming the two - rather than read as "no platform matched".
 */
export function refuseUnknownPlatformFlag(options: { [PLATFORM_OPTION]?: string }) {
  const givenPlatform = options[PLATFORM_OPTION];
  if (givenPlatform === undefined || givenPlatform === 'android' || givenPlatform === 'ios') return;

  throwError(renderPlatformUnknown(givenPlatform));
}

/**
 * Sherlo 3 tests only app builds it made itself, so a path handed in is refused before anything
 * runs - exit 1, like every other refused argument. The `android` and `ios` keys of
 * sherlo.config.json are refused with the same words (validateConfigProperties).
 */
export function refuseBinaryPathFlags(options: {
  [ANDROID_OPTION]?: string;
  [IOS_OPTION]?: string;
}) {
  if (options[ANDROID_OPTION] === undefined && options[IOS_OPTION] === undefined) return;

  throwError(renderBinaryPathFlagGone());
}
