/**
 * The configuration an iOS build uses, read from the APP target's own configurations, never a test
 * target's or an extension's: the one the config names, else the app target's Release (any case,
 * passed spelled as the app spells it), else the one the scheme archives with, else Release - and
 * then xcodebuild says what it says. Asked of the project's files, so it is seam work.
 *
 * The app target is the target a shared scheme's BuildAction builds whose product type is an
 * application. The project files are read by the SDK's reader (react-native-storybook
 * metro/xcodeProject.js), the same one its linking config reads them with.
 */
import fs from 'fs';
import path from 'path';
import {
  APPLICATION_PRODUCT_TYPE,
  readXcodeProjects,
  type NativeTarget,
} from '../../../react-native-storybook/metro/xcodeProject';
import type { IosConfigurationSource } from '../render/appBuild';

/** The iOS application target as the workspace states it. */
export type IosAppTarget = {
  /** The schemes that build an application product, not a test bundle. */
  appSchemes: string[];
  /** The application target's configurations, in the project's spelling. */
  configurations: string[];
  /** The configuration the app scheme archives with. */
  archiveConfiguration: string;
};

/** The text of a file, or undefined when it is not there. */
export function readIfThere(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // Not there (or not readable): the caller falls back to the next source.
    return undefined;
  }
}

/** The text of each shared scheme of the project and the workspace, by scheme name; the first one found wins. */
function readSharedSchemes(iosFolder: string): Map<string, string> {
  const schemes = new Map<string, string>();
  const containers = fs
    .readdirSync(iosFolder)
    .filter((name) => /\.(xcodeproj|xcworkspace)$/.test(name));
  for (const container of containers) {
    const folder = path.join(iosFolder, container, 'xcshareddata/xcschemes');
    const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    for (const file of files.filter((name) => name.endsWith('.xcscheme'))) {
      const name = file.slice(0, -'.xcscheme'.length);
      const text = readIfThere(path.join(folder, file));
      if (text !== undefined && !schemes.has(name)) schemes.set(name, text);
    }
  }
  return schemes;
}

/**
 * The application target a scheme builds: of the targets its BuildAction names (a TestAction's are
 * left out), the one whose product type is an application. Looked for in the project the reference
 * names, else in every project of the folder.
 */
function appTargetOfScheme(
  scheme: string,
  projects: ReturnType<typeof readXcodeProjects>
): NativeTarget | undefined {
  const buildAction = /<BuildAction\b[\s\S]*?<\/BuildAction>/.exec(scheme)?.[0] ?? '';
  for (const reference of buildAction.match(/<BuildableReference\b[^>]*>/g) ?? []) {
    const id = /\bBlueprintIdentifier\s*=\s*"([^"]*)"/.exec(reference)?.[1];
    const container = /\bReferencedContainer\s*=\s*"container:([^"]*)"/.exec(reference)?.[1];
    const named = projects.filter(
      (project) => project.container === path.basename(container ?? '')
    );
    for (const project of named.length > 0 ? named : projects) {
      const target = project.targets.find(
        (candidate) => candidate.id === id && candidate.productType === APPLICATION_PRODUCT_TYPE
      );
      if (target) return target;
    }
  }
  return undefined;
}

/** The `buildConfiguration` of a scheme's `ArchiveAction`. */
function archiveConfigurationOf(scheme: string): string | undefined {
  const archiveAction = /<ArchiveAction\b[^>]*>/.exec(scheme)?.[0];
  return /\bbuildConfiguration\s*=\s*"([^"]*)"/.exec(archiveAction ?? '')?.[1];
}

/**
 * What the shared schemes say of the application target: the schemes that build an app, and, of
 * the scheme given (else the only app scheme), the app target's configurations and the
 * configuration it archives with. Null when there is no such scheme, it builds no app, or it names
 * no archive configuration.
 */
export function readIosAppTargetFromFiles(iosFolder: string, scheme?: string): IosAppTarget | null {
  if (!fs.existsSync(iosFolder)) return null;
  const schemes = readSharedSchemes(iosFolder);
  const projects = readXcodeProjects(iosFolder);
  const appTargets = new Map<string, NativeTarget>();
  for (const [name, text] of schemes) {
    const target = appTargetOfScheme(text, projects);
    if (target) appTargets.set(name, target);
  }
  const appSchemes = [...appTargets.keys()];

  const picked = scheme ?? (appSchemes.length === 1 ? appSchemes[0] : undefined);
  if (picked === undefined) return null;
  const target = appTargets.get(picked);
  const archiveConfiguration = archiveConfigurationOf(schemes.get(picked) ?? '');
  if (!target || !archiveConfiguration) return null;
  return { appSchemes, configurations: target.configurations, archiveConfiguration };
}

/**
 * The configuration to build from the app target: the one named, matched without regard to case
 * and spelled as the app spells it (null when the app target lacks it), else its Release, else the
 * one the scheme archives with.
 */
export function pickIosConfiguration(
  target: IosAppTarget,
  named: string | undefined
): { name: string; from: IosConfigurationSource } | null {
  const appSpellingOf = (wanted: string) =>
    target.configurations.find((name) => name.toLowerCase() === wanted.toLowerCase());
  if (named) {
    const found = appSpellingOf(named);
    return found ? { name: found, from: 'config' } : null;
  }
  const release = appSpellingOf('release');
  if (release) return { name: release, from: 'release' };
  return { name: target.archiveConfiguration, from: 'archive' };
}

/** The configuration to build: the one given, else the app target's pick, else Release. */
export function iosBuildConfiguration(params: {
  iosFolder: string;
  scheme: string;
  configuration?: string;
}): string {
  const { iosFolder, scheme, configuration } = params;
  if (configuration) return configuration;
  const target = readIosAppTargetFromFiles(iosFolder, scheme);
  return (target && pickIosConfiguration(target, undefined)?.name) ?? 'Release';
}
