import chalk from 'chalk';
import { PLATFORM_LABEL } from '../../constants';
import { CommandParams } from '../../types';
import countDevicesByPlatform from './countDevicesByPlatform';

function printBuildIntroMessage({
  commandParams,
  nextBuildIndex,
}: {
  commandParams: CommandParams;
  nextBuildIndex: number;
}) {
  const platformCounts = countDevicesByPlatform(commandParams.devices);
  const totalDevices = platformCounts.android + platformCounts.ios;
  const deviceText = totalDevices === 1 ? 'device' : 'devices';

  const platformBreakdown = [];
  if (platformCounts.android) {
    platformBreakdown.push(`${platformCounts.android} ${PLATFORM_LABEL.android}`);
  }
  if (platformCounts.ios) {
    platformBreakdown.push(`${platformCounts.ios} ${PLATFORM_LABEL.ios}`);
  }

  console.log(
    `${chalk.green(`Test ${nextBuildIndex}`)} will run on ${chalk.blue(
      `${totalDevices} ${deviceText}`
    )} (${platformBreakdown.join(', ')})\n`
  );
}

export default printBuildIntroMessage;
