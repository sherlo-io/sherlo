import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import {
  type BuildPlace,
  renderBuildPlaceQuestion,
  renderBuilds,
  renderEasSetUp,
} from '../../../render/initBuilds';
import { workstation } from '../../../seams/workstation';
import { DEFAULT_EAS_PROFILE } from '../../test/appBuild/buildSettings';
import readConfig from '../config/readConfig';
import writeConfig from '../config/writeConfig';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';

/** The package.json script each EAS build uploads itself to Sherlo through. */
const EAS_HOOK_SCRIPT = 'eas-build-on-complete';

/**
 * WHERE THE APP IS BUILT (epic sherlo-test-builds-apps): `sherlo test` builds it itself, so setup no
 * longer tells anyone to make builds - it says how the first run builds, and, in a project that
 * already builds on EAS (it has an eas.json), asks whether Sherlo should build there instead.
 *
 * Nobody at the keyboard - CI, an agent - is never asked: the build stays where `sherlo test` runs,
 * the default that needs no Expo login.
 *
 * Picking EAS writes everything EAS mode needs, so the first `sherlo test` just works:
 * `"build": { "tool": "eas" }` in sherlo.config.json, the `eas-build-on-complete` script in
 * package.json, and a "sherlo" profile in eas.json when it has none.
 */
async function builds({ sessionId }: { sessionId: string | null }): Promise<void> {
  const projectRoot = getCwd();
  const easJsonPath = path.join(projectRoot, 'eas.json');
  const asksWhereToBuild = fs.existsSync(easJsonPath) && workstation().somebodyIsAtTheKeyboard();

  printLines(renderBuilds({ terminalColumns: process.stdout.columns, asksWhereToBuild }));

  let place: BuildPlace = 'local';
  if (asksWhereToBuild) {
    const question = renderBuildPlaceQuestion();
    place = await workstation().chooseOne<BuildPlace>({
      question: question.question,
      choices: question.choices,
    });
  }

  if (place === 'eas') {
    const profileAdded = await setUpEasMode({ projectRoot, easJsonPath });
    printLines(renderEasSetUp({ profileAdded }));
  }

  await trackProgress({
    event: EVENT,
    params: { place },
    sessionId,
  });
}

/** Write the three things EAS mode needs, and say whether the eas.json profile had to be added. */
async function setUpEasMode({
  projectRoot,
  easJsonPath,
}: {
  projectRoot: string;
  easJsonPath: string;
}): Promise<boolean> {
  const config = (await readConfig()) as Record<string, unknown>;
  await writeConfig({ ...config, build: { ...(config.build as object | undefined), tool: 'eas' } } as never);

  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.scripts = { ...packageJson.scripts, [EAS_HOOK_SCRIPT]: `sherlo ${EAS_HOOK_SCRIPT}` };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
  if (easJson.build?.[DEFAULT_EAS_PROFILE]) return false;

  // A simulator build for iOS and an APK for Android - the two shapes a Sherlo device runs.
  easJson.build = {
    ...easJson.build,
    [DEFAULT_EAS_PROFILE]: { ios: { simulator: true }, android: { buildType: 'apk' } },
  };
  fs.writeFileSync(easJsonPath, `${JSON.stringify(easJson, null, 2)}\n`);
  return true;
}

export default builds;
