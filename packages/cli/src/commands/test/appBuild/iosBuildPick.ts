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
  const named = settings.ios?.scheme;
  const schemes = named ? [] : await appBuilder().listIosSchemes(projectRoot);
  const target = await appBuilder().readIosAppTarget(
    projectRoot,
    named ?? (schemes.length === 1 ? schemes[0] : undefined)
  );
  const pick = pickIosScheme({ named, schemes, appSchemes: target?.appSchemes ?? [] });
  if (!pick) {
    return refuseToBuildHere(
      `Can't pick an iOS scheme: the workspace has ${namesInAList(schemes)}.\n` +
        `Name one in sherlo.config.json: "build": { "ios": { "scheme": "${
          target?.appSchemes.find((name) => schemes.includes(name)) ?? schemes[0] ?? 'MyApp'
        }" } }`,
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

/** `A and B`, `A, B and C`. */
function namesInAList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
