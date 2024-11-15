import chalk from 'chalk';
import { Config } from '../types';
import countDevicesByPlatform from './countDevicesByPlatform';
import { PLATFORM_LABEL } from '../constants';

function logBuildIntroMessage(config: Config) {
  const platformCounts = countDevicesByPlatform(config.devices);

  const platformCountsMessage = [];
  let lastCount = 0;

  if (platformCounts.android) {
    platformCountsMessage.push(
      `${chalk.blue(`${platformCounts.android} ${PLATFORM_LABEL.android}`)}`
    );
    lastCount = platformCounts.android;
  }

  if (platformCounts.ios) {
    platformCountsMessage.push(`${chalk.blue(`${platformCounts.ios} ${PLATFORM_LABEL.ios}`)}`);
    lastCount = platformCounts.ios;
  }

  const deviceText = lastCount === 1 ? 'device' : 'devices';
  console.log(
    // TODO: buildIndex
    `${chalk.green('Build 42069')} tests will run on ${platformCountsMessage.join(' and ')} ${deviceText}\n`
  );
}

export default logBuildIntroMessage;
