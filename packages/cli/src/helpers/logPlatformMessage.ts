import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { PLATFORM_LABEL } from '../constants';

function logPlatformMessage({
  platform,
  message,
  type,
  endsWithNewLine,
}: {
  platform: Platform;
  message: string;
  type: 'info' | 'success';
  endsWithNewLine?: boolean;
}) {
  const iconColor = type === 'success' ? 'green' : 'blue';
  const icon = type === 'success' ? '✔' : '➜';

  console.log(`${chalk[iconColor](icon)} ${chalk.bold(PLATFORM_LABEL[platform])}: ${message}`);

  if (endsWithNewLine) console.log();
}

export default logPlatformMessage;
