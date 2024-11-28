import chalk from 'chalk';
import { PLATFORM_LABEL } from '../constants';
import { Platform } from '@sherlo/api-types';

function logBuildPlatformLabel(platform: Platform) {
  console.log('📦 ' + chalk.bold(PLATFORM_LABEL[platform]));
}

export default logBuildPlatformLabel;
