import fs from 'fs';
import path from 'path';
import { podsAreCurrent } from '../seams/podTouchedFiles';

/** The Sherlo pod as an xcconfig names it: a library or framework, with `-` or `_`. */
const SHERLO_POD_NAME = /sherlo[-_]react[-_]native[-_]storybook/;

/** A text file, or undefined when there is none. */
export function readTextIfThere(filePath: string): string | undefined {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
}

/**
 * Whether the installed pods link Sherlo into a configuration. CocoaPods writes, for each
 * configuration, `Pods/Target Support Files/Pods-<target>/Pods-<target>.<configuration lowercased>.xcconfig`
 * with the libraries that configuration links. It is the file Xcode builds with, and CocoaPods
 * leaves a pod a configuration does not carry out of its OTHER_LDFLAGS, so the pod's library named
 * there is the real answer (its search paths name it in every configuration, so they never count) (the Pods project's own pbxproj lists the pod target for every configuration).
 */
export function podsLinkSherloInto(iosFolder: string, configuration: string): boolean {
  return xcconfigsLinkingSherlo(iosFolder).some(
    ({ folder, file }) => file === `${folder}.${configuration.toLowerCase()}.xcconfig`
  );
}

/** Every Pods xcconfig, as its folder and file name, that links the Sherlo pod. */
function xcconfigsLinkingSherlo(iosFolder: string): { folder: string; file: string }[] {
  const supportFiles = path.join(iosFolder, 'Pods/Target Support Files');
  if (!fs.existsSync(supportFiles)) return [];
  return fs
    .readdirSync(supportFiles)
    .filter((folder) => folder.startsWith('Pods-'))
    .flatMap((folder) =>
      fs
        .readdirSync(path.join(supportFiles, folder))
        .filter((file) => file.endsWith('.xcconfig'))
        .map((file) => ({ folder, file }))
        .filter(({ file }) =>
          SHERLO_POD_NAME.test(
            linkerFlagsOf(readTextIfThere(path.join(supportFiles, folder, file)) ?? '')
          )
        )
    );
}

/**
 * The part of an xcconfig that says what it links: its lines without the other settings.
 * CocoaPods writes every pod's header and framework search paths into every configuration, also
 * for a pod limited to another one, and filters only OTHER_LDFLAGS by configuration. So a line
 * that sets anything but OTHER_LDFLAGS (`KEY = value`) never counts; a line of no setting does.
 */
function linkerFlagsOf(xcconfig: string): string {
  return xcconfig
    .split('\n')
    .filter(
      (line) =>
        /^\s*OTHER_LDFLAGS\s*=/.test(line) || !/^\s*[A-Za-z_]\w*(\[[^\]]*\])*\s*=/.test(line)
    )
    .join('\n');
}

/**
 * Whether the installed pods are current and link Sherlo, so a `pod install` would change nothing
 * that matters. CocoaPods' own "in sync" test (`podsAreCurrent`) says nothing of which
 * configurations a pod was linked into (that depends on SHERLO_BUILD at the time of the install),
 * so the generated xcconfig of each given configuration is read too. With no configurations given,
 * Sherlo linked into at least one configuration of any name is enough.
 */
export function installedPodsAreCurrent(iosFolder: string, configurations?: string[]): boolean {
  return (
    podsAreCurrent(iosFolder) &&
    (configurations
      ? configurations.every((configuration) => podsLinkSherloInto(iosFolder, configuration))
      : xcconfigsLinkingSherlo(iosFolder).length > 0)
  );
}
