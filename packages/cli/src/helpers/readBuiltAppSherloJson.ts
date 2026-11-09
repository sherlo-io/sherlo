import accessFileInArchive from './getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive';
import accessFileInDirectory from './getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory';

/** Where a built app keeps sherlo.json in its own assets folder. */
const APP_SHERLO_JSON_PATH = 'assets/sherlo.json';

/**
 * Where a built iOS app keeps sherlo.json, in the order they are tried: the app's own assets
 * folder, then the SDK framework's assets folder, which is where it lands when the app loads its
 * pods as dynamic frameworks.
 */
const IOS_SHERLO_JSON_PATHS = [
  APP_SHERLO_JSON_PATH,
  'Frameworks/sherlo_react_native_storybook.framework/assets/sherlo.json',
];

/** Inside an iOS archive the app sits under a `<AppName>.app/` folder. */
export const IOS_TAR_BUNDLE_PREFIX = '*.app/';

/**
 * Reads sherlo.json out of a built app: an `.app` folder, an `.apk`, or an iOS `.tar` or `.tar.gz`.
 * Answers its text, or undefined when the build holds none.
 */
async function readBuiltAppSherloJson({
  binaryPath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  projectRoot: string;
}): Promise<string | undefined> {
  if (fileName.endsWith('.apk')) {
    return accessFileInArchive({
      operation: 'read',
      file: APP_SHERLO_JSON_PATH,
      archive: binaryPath,
      type: 'unzip',
      projectRoot,
    });
  }

  for (const file of IOS_SHERLO_JSON_PATHS) {
    const content = fileName.endsWith('.app')
      ? await accessFileInDirectory({ operation: 'read', file, directory: binaryPath })
      : await accessFileInArchive({
          operation: 'read',
          file: IOS_TAR_BUNDLE_PREFIX + file,
          archive: binaryPath,
          type: 'tar',
          projectRoot,
        });

    if (content) return content;
  }

  return undefined;
}

export default readBuiltAppSherloJson;
