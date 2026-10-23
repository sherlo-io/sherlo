/**
 * The configuration an iOS build uses when the Sherlo config names none: Release when the Xcode
 * project has one (any case), else the one the scheme archives with, else Release - and then
 * xcodebuild says what it says. Asked of the project's files, so it is seam work.
 */
import fs from 'fs';
import path from 'path';

/** The text of a file, or undefined when it is not there. */
export function readIfThere(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // Not there (or not readable): the caller falls back to the next source.
    return undefined;
  }
}

/** The names of the build configurations the iOS folder's Xcode projects declare. */
function configurationNames(iosFolder: string): string[] {
  const names: string[] = [];
  for (const container of fs.readdirSync(iosFolder).filter((name) => name.endsWith('.xcodeproj'))) {
    const text = readIfThere(path.join(iosFolder, container, 'project.pbxproj')) ?? '';
    for (const block of text.split('isa = XCBuildConfiguration;').slice(1)) {
      const name = /\bname = ("[^"]*"|[^;\s]+);/.exec(block)?.[1];
      if (name) names.push(name.replace(/^"|"$/g, ''));
    }
  }
  return names;
}

/** The `buildConfiguration` of the scheme's `ArchiveAction`, in the shared schemes of the project and workspace. */
function archiveConfiguration(iosFolder: string, scheme: string): string | undefined {
  const containers = fs
    .readdirSync(iosFolder)
    .filter((name) => /\.(xcodeproj|xcworkspace)$/.test(name));
  for (const container of containers) {
    const file = path.join(iosFolder, container, 'xcshareddata/xcschemes', `${scheme}.xcscheme`);
    const archiveAction = /<ArchiveAction\b[^>]*>/.exec(readIfThere(file) ?? '')?.[0];
    const configuration = /\bbuildConfiguration\s*=\s*"([^"]*)"/.exec(archiveAction ?? '')?.[1];
    if (configuration) return configuration;
  }
  return undefined;
}

/** The configuration to build: the one given, else Release if the project has it, else the archive one. */
export function iosBuildConfiguration(params: {
  iosFolder: string;
  scheme: string;
  configuration?: string;
}): string {
  const { iosFolder, scheme, configuration } = params;
  if (configuration) return configuration;
  const names = configurationNames(iosFolder);
  if (names.some((name) => name.toLowerCase() === 'release')) return 'Release';
  return archiveConfiguration(iosFolder, scheme) ?? 'Release';
}
