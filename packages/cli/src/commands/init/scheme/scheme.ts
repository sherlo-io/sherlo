/**
 * THE iOS SCHEME SETUP WRITES, after the config: the scheme the app builds with, in
 * sherlo.config.json's `build.ios.scheme`, so the first push does not stop on "Can't pick an iOS
 * scheme". The schemes are the workspace's own, with the CocoaPods project's dropped, as the test
 * build lists them (../../../seams/appBuilder `listIosSchemes`), and picked by the test build's rule
 * (../../../seams/iosScheme `pickIosScheme`). Several are asked of a person; with nobody at the
 * keyboard, setup names them and the field to set. Tested in ./__tests__/scheme.
 */
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getCwd } from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import {
  listAndPickIosScheme,
  nameIosSchemeLine,
  namesInAList,
} from '../../test/appBuild/iosBuildPick';
import type { InvalidatedConfig } from '../../../types';
import readConfig from '../config/readConfig';
import writeConfig from '../config/writeConfig';

/** The config as setup reads it, with the `build` block the test build reads (../../test/appBuild/buildSettings). */
type ConfigWithBuild = InvalidatedConfig & { build?: { ios?: { scheme?: string } } };

async function scheme(): Promise<void> {
  const projectRoot = getCwd();
  const iosFolder = path.join(projectRoot, 'ios');
  // Only a workspace lists the schemes of the pods beside the app's; a project alone has its own.
  const hasWorkspace =
    fs.existsSync(iosFolder) &&
    fs.readdirSync(iosFolder).some((name) => name.endsWith('.xcworkspace'));
  if (!hasWorkspace) return;

  const config: ConfigWithBuild = await readConfig();
  if (config.build?.ios?.scheme) return;

  let listed: Awaited<ReturnType<typeof listAndPickIosScheme>>;
  try {
    listed = await listAndPickIosScheme(projectRoot, undefined);
  } catch {
    // No xcodebuild here, or it could not read the workspace: the first push picks or refuses then.
    return;
  }
  const { schemes, target, pick } = listed;
  if (schemes.length === 0) return;

  if (pick) {
    await writeScheme(config, pick.scheme);
    return;
  }

  // Several schemes and no single app scheme among them: those that build an app, when known.
  const appSchemes = schemes.filter((name) => target?.appSchemes.includes(name));
  const offered = appSchemes.length > 1 ? appSchemes : schemes;

  if (!workstation().somebodyIsAtTheKeyboard()) {
    console.log(`The iOS workspace has ${namesInAList(offered)}.`);
    console.log(`  ${nameIosSchemeLine(schemes, target?.appSchemes ?? [])}`);
    return;
  }

  const chosen = await workstation().chooseOne({
    question: 'Which iOS scheme builds your app?',
    choices: offered.map((name) => ({ name, value: name })),
  });
  await writeScheme(config, chosen);
}

export default scheme;

/** The config written back with the scheme in `build.ios.scheme`, and the line that says so. */
async function writeScheme(config: ConfigWithBuild, schemeName: string): Promise<void> {
  const written: ConfigWithBuild = {
    ...config,
    build: { ...config.build, ios: { ...config.build?.ios, scheme: schemeName } },
  };
  await writeConfig(written);
  console.log(`${chalk.green('✔')} iOS scheme "${schemeName}" written to sherlo.config.json`);
}
