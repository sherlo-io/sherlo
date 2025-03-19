import chalk from 'chalk';
import gradientString from 'gradient-string';
import {
  COLOR,
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
} from '../../../constants';
import { logInfo, printLink } from '../../../helpers';
import { printSubtitle, printTitle, wrapInBox, trackProgress } from '../helpers';
import { ProjectType } from '../types';
import { EVENT } from './constants';
import updateEasJson from './updateEasJson';

async function buildAndTest({
  hasUpdatedStorybookComponent,
  projectType,
  sessionId,
}: {
  hasUpdatedStorybookComponent: boolean;
  projectType: ProjectType;
  sessionId: string;
}): Promise<void> {
  printTitle('🏗️ Build & Test');

  printSubtitle('1) Build your app for simulators...', { hasTopMargin: false });

  printBuildWarning(hasUpdatedStorybookComponent);

  let easJsonStatus;
  if (projectType === 'expo') {
    ({ status: easJsonStatus } = await updateEasJson());

    console.log();
  }

  printBuildCommand(projectType);

  printSubtitle('2) ...and test it with Sherlo! 🚀');

  printTestCommand();

  if (projectType === 'expo') {
    printAlternativeCommands();
  }

  console.log();

  logInfo({
    message: 'The examples above feature Android, but iOS is supported too!',
  });

  console.log();

  console.log(`Learn more: ${printLink(DOCS_LINK.testing)}`);

  await trackProgress({
    event: EVENT,
    params: { projectType, hasUpdatedStorybookComponent, easJsonStatus },
    sessionId,
  });
}

export default buildAndTest;

/* ========================================================================== */

function printBuildWarning(hasUpdatedStorybookComponent: boolean): void {
  console.log(
    wrapInBox({
      type: 'warning',
      title: '⚠️ Before building',
      text: hasUpdatedStorybookComponent
        ? `Make sure you have provided ${chalk.bold('Storybook Access')}`
        : 'Make sure you have:' +
          `\n• updated ${chalk.bold('Storybook Component')}` +
          `\n• provided ${chalk.bold('Storybook Access')}`,
    })
  );

  console.log();
}

function printBuildCommand(projectType: ProjectType): void {
  let buildCommand, buildOutput;

  if (projectType === 'react-native') {
    buildCommand = `${chalk.cyan('npx react-native run-android')} --mode Release`;

    buildOutput = 'android/app/build/outputs/apk/release/app-release.apk';
  } else {
    buildCommand = `${chalk.cyan(
      'npx eas-cli build'
    )} --local --profile simulator:preview --platform android --output builds/simulator/preview/android.apk`;

    buildOutput = 'builds/simulator/preview/android.apk';
  }

  console.log(
    wrapInBox({
      title: 'Build command',
      type: 'command',
      text: buildCommand,
    })
  );

  console.log(chalk.dim(` Output: ${buildOutput}`));
}

function printTestCommand(): void {
  console.log(
    wrapInBox({
      title: 'Test command',
      type: 'command',
      text: `${gradientString(
        COLOR.reported,
        COLOR.approved,
        COLOR.noChanges
      )(`npx sherlo ${LOCAL_BUILDS_COMMAND}`)} --android BUILD_PATH`,
    })
  );
}

function printAlternativeCommands(): void {
  console.log();

  console.log('Alternative commands:');

  console.log(
    '- ' +
      chalk.cyan(`npx sherlo ${EXPO_UPDATE_COMMAND}`) +
      ' ' +
      chalk.dim('- uses EAS Update to push JS changes without native rebuilds')
  );

  console.log(
    '- ' +
      chalk.cyan(`npx sherlo ${EXPO_CLOUD_BUILDS_COMMAND}`) +
      ' ' +
      chalk.dim('- uses EAS Build to build your app on Expo servers')
  );
}
