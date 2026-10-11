/**
 * WHAT CHANGED SINCE THE STORED APP BUILD - the list `sherlo test` prints under "Android needs a
 * new app build", so the developer sees which native change cost them a build (operator decision
 * 2026-10-11).
 *
 * Pure: the stored app build's source list, as the staged gate handed it back, against the
 * sources this run's own base fingerprint was computed over. Both sides are paths, hashes and
 * versions - never a file's contents - and the comparison is the one `sherlo fingerprint
 * --baseline` makes (../../fingerprint/diffFingerprintDocuments), so the two can never disagree
 * about what counts as a change.
 *
 * A BARE PROJECT'S NATIVE FOLDER IS NAMED BY THE FILE THAT CHANGED INSIDE IT. Expo's fingerprint
 * hashes `android` and `ios` as one source each, so the folder alone could only say `~ android`.
 * The stored list also keeps each folder's files with a hash apiece, and this run hashes its own
 * (the app builder seam's `hashNativeFolderFiles`), so a folder both sides hashed file by file is
 * compared file by file: `~ android/app/build.gradle`. Those per-file hashes exist for this list
 * alone - the base fingerprint and the rebuild decision never read them. A folder an older CLI
 * stored without its files is compared as one entry, as before.
 */
import type { BaseFingerprintPreimage } from '../../../helpers/fingerprint/baseFingerprint';
import type { NativeChange } from '../../../render/appBuild';
import type { NativeFolderFile, StoredBaseSources } from '../../../seams/serverCalls';
import {
  autolinkedAsPackages,
  diffFiles,
  diffPackages,
  type DeltaEntry,
} from '../../fingerprint/diffFingerprintDocuments';

/**
 * A `contents` source has no path a developer would know - it is a resolved setting - so the
 * ones a developer edits are named by the file they edit. Any other is printed by its id.
 */
const CONTENTS_SOURCE_NAMES: Record<string, string> = {
  expoConfig: 'app.json (Expo config)',
  expoConfigPlugins: 'app.json (Expo plugins)',
  'packageJson:scripts': 'package.json (scripts)',
};

/** `package:react-native` is the installed version of that package. */
const INSTALLED_PACKAGE_PREFIX = 'package:';

function settingName(id: string): string {
  if (CONTENTS_SOURCE_NAMES[id]) return CONTENTS_SOURCE_NAMES[id];
  if (id.startsWith(INSTALLED_PACKAGE_PREFIX)) {
    return `${id.slice(INSTALLED_PACKAGE_PREFIX.length)} (installed version)`;
  }
  return id;
}

function isInsideFolder(filePath: string, folder: string): boolean {
  return filePath.startsWith(`${folder}/`);
}

/**
 * The native folders the stored list keeps file by file - the ones whose files this run hashes
 * before comparing. Empty for a managed project, and for a list an older CLI stored.
 */
export function foldersStoredFileByFile(storedBase: StoredBaseSources): string[] {
  return storedBase.sources
    .filter((source) => source.kind === 'dir' && source.files !== undefined)
    .map((source) => source.path);
}

/**
 * Every change between the stored app build and this run, in the order they print: native files
 * and lockfiles, then native modules, then resolved settings. `thisRunFolderFiles` are this run's
 * files inside the folders {@link foldersStoredFileByFile} named, one hash each.
 */
export function nativeChangesSince(
  storedBase: StoredBaseSources,
  thisRun: BaseFingerprintPreimage,
  thisRunFolderFiles: NativeFolderFile[]
): NativeChange[] {
  // A folder is compared file by file only when BOTH sides hashed its files; otherwise it stays
  // one entry, so a folder that is gone this run reads `- android`, not every file it held.
  const foldersByFile = foldersStoredFileByFile(storedBase).filter((folder) =>
    thisRunFolderFiles.some((file) => isInsideFolder(file.path, folder))
  );

  const storedFiles = storedBase.sources
    .filter((source) => source.kind !== 'contents')
    .flatMap((source) =>
      foldersByFile.includes(source.path)
        ? (source.files ?? []).map((file) => ({ path: file.path, digest: file.hash }))
        : [{ path: source.path, digest: source.hash ?? 'excluded' }]
    );
  const thisRunFiles = [
    ...thisRun.nativeSources
      .filter((source) => source.type !== 'contents' && !foldersByFile.includes(source.id))
      .map((source) => ({ path: source.id, digest: source.hash ?? 'excluded' })),
    ...thisRunFolderFiles
      .filter((file) => foldersByFile.some((folder) => isInsideFolder(file.path, folder)))
      .map((file) => ({ path: file.path, digest: file.hash })),
    ...thisRun.lockfiles.map((lockfile) => ({ path: lockfile.file, digest: lockfile.digest })),
  ];

  const storedSettings = storedBase.sources
    .filter((source) => source.kind === 'contents')
    .map((source) => ({ path: source.path, digest: source.hash ?? 'excluded' }));
  const thisRunSettings = thisRun.nativeSources
    .filter((source) => source.type === 'contents')
    .map((source) => ({ path: source.id, digest: source.hash ?? 'excluded' }));

  const storedModules = storedBase.modules.map(({ name, version }) => ({
    name,
    versions: [version],
  }));
  const thisRunModules = autolinkedAsPackages(thisRun.autolinkedModules);

  return [
    ...diffFiles(storedFiles, thisRunFiles).map(fileChange),
    ...diffPackages(storedModules, thisRunModules).map(moduleChange),
    ...diffFiles(storedSettings, thisRunSettings).map((entry) =>
      fileChange({ ...entry, name: settingName(entry.name) })
    ),
  ];
}

function fileChange(entry: DeltaEntry): NativeChange {
  return { change: entry.kind, file: entry.name };
}

function moduleChange(entry: DeltaEntry): NativeChange {
  if (entry.kind === 'changed') {
    return { change: 'changed', module: entry.name, from: entry.before ?? '', to: entry.after ?? '' };
  }
  return {
    change: entry.kind,
    module: entry.name,
    version: (entry.kind === 'added' ? entry.after : entry.before) ?? '',
  };
}
