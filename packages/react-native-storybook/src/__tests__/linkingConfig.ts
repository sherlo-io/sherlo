/**
 * The SDK's native linking config (react-native.config.js) as autolinking reads it, for the tests
 * of that linking.
 */
const CONFIG_PATH = '../../react-native.config.js';

export type PlatformConfig = {
  configurations?: string[];
  buildTypes?: string[];
  packageInstance?: string;
  cmakeListsPath?: string;
};

/** The config's platforms, with SHERLO_BUILD set to `value` (unset when undefined). */
export function loadPlatformsWith(value: string | undefined): {
  ios: PlatformConfig;
  android: PlatformConfig;
} {
  const before = process.env.SHERLO_BUILD;
  if (value === undefined) delete process.env.SHERLO_BUILD;
  else process.env.SHERLO_BUILD = value;

  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    return require(CONFIG_PATH).dependency.platforms;
  } finally {
    if (before === undefined) delete process.env.SHERLO_BUILD;
    else process.env.SHERLO_BUILD = before;
  }
}
