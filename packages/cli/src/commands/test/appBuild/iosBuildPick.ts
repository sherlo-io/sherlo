/**
 * THE STEP BEFORE AN iOS BUILD STARTS (./buildApps): the scheme and the app target's configuration
 * the build uses, or a refusal naming what to set. Tested in ./__tests__/iosBuildPick.
 */
import { throwError } from '../../../helpers';
import {
  renderRunOnCi,
  renderUnknownIosConfiguration,
  type IosConfigurationSource,
} from '../../../render/appBuild';
import type { SherloProject } from '../../../render/testSteps';
import { appBuilder } from '../../../seams/appBuilder';
import { pickIosConfiguration } from '../../../seams/iosConfiguration';
import { pickIosScheme } from '../../../seams/iosScheme';
import type { BuildSettings } from './buildSettings';

/**
 * Refuse to build on this machine: the refusal's own words, and under them the line that points to
 * building on CI instead (../../../render/appBuild `renderRunOnCi`), as every failure to build here
 * ends.
 */
export function refuseToBuildHere(message: string, project: SherloProject | undefined): never {
  return throwError({ message, below: renderRunOnCi(project) });
}

/**
 * The scheme (../../../seams/iosScheme) and the app target's configuration
 * (../../../seams/iosConfiguration), or a refusal naming what to set. The configuration is null
 * when the app target was not read.
 */
export async function pickIosBuild(
  projectRoot: string,
  settings: BuildSettings,
  project: SherloProject | undefined
): Promise<{
  scheme: string;
  passedOverSchemes: string[];
  configuration: { name: string; from: IosConfigurationSource } | null;
}> {
  const { schemes, target, pick } = await listAndPickIosScheme(projectRoot, settings.ios?.scheme);
  if (!pick) {
    return refuseToBuildHere(
      `Can't pick an iOS scheme: the workspace has ${namesInAList(schemes)}.\n` +
        nameIosSchemeLine(schemes, target?.appSchemes ?? []),
      project
    );
  }
  if (!target) return { scheme: pick.scheme, passedOverSchemes: [], configuration: null };

  // Null only for a configuration the config names and the app target lacks.
  const namedConfiguration = settings.ios?.configuration ?? '';
  const configuration = pickIosConfiguration(target, namedConfiguration);
  if (!configuration) {
    return refuseToBuildHere(
      renderUnknownIosConfiguration({
        configuration: namedConfiguration,
        configurations: target.configurations,
      }),
      project
    );
  }
  return { scheme: pick.scheme, passedOverSchemes: pick.skippedSchemes, configuration };
}

/**
 * The workspace's schemes (../../../seams/appBuilder `listIosSchemes`, listed only when the config
 * names none), the app target, and the scheme picked by ../../../seams/iosScheme `pickIosScheme`:
 * the one pick the test build and setup's scheme step (../../init/scheme) both make.
 */
export async function listAndPickIosScheme(projectRoot: string, named: string | undefined) {
  const schemes = named ? [] : await appBuilder().listIosSchemes(projectRoot);
  const target = await appBuilder().readIosAppTarget(
    projectRoot,
    named ?? (schemes.length === 1 ? schemes[0] : undefined)
  );
  const pick = pickIosScheme({ named, schemes, appSchemes: target?.appSchemes ?? [] });
  return { schemes, target, pick };
}

/** The line naming the config field to set when no scheme is picked, the first app scheme listed as its example. */
export function nameIosSchemeLine(schemes: string[], appSchemes: string[]): string {
  const example = appSchemes.find((name) => schemes.includes(name)) ?? schemes[0] ?? 'MyApp';
  return `Name one in sherlo.config.json: "build": { "ios": { "scheme": "${example}" } }`;
}

/** `A and B`, `A, B and C`: the schemes the test build and setup name when neither can pick one. */
export function namesInAList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
