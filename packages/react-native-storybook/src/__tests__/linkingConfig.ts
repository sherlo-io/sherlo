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

/**
 * The config's platforms, with SHERLO_BUILD set to `value` (unset when undefined) and, when
 * `workingFolder` is given, loaded from that folder, the way autolinking runs it from the folder
 * `pod install` runs in. `ios` is null when the config answers that iOS does not link the module.
 */
export function loadPlatformsWith(
  value: string | undefined,
  workingFolder?: string
): {
  ios: PlatformConfig | null;
  android: PlatformConfig;
} {
  const before = process.env.SHERLO_BUILD;
  const folderBefore = process.cwd();
  if (value === undefined) delete process.env.SHERLO_BUILD;
  else process.env.SHERLO_BUILD = value;
  if (workingFolder !== undefined) process.chdir(workingFolder);

  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    return require(CONFIG_PATH).dependency.platforms;
  } finally {
    process.chdir(folderBefore);
    if (before === undefined) delete process.env.SHERLO_BUILD;
    else process.env.SHERLO_BUILD = before;
  }
}
