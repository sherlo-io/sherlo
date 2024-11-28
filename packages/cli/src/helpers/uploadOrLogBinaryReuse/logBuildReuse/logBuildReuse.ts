import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { PLATFORM_LABEL } from '../../../constants';
import { BinaryInfo } from '../../../types';
import logBuildMessage from '../../logBuildMessage';
import throwError from '../../throwError';
import getTimeAgo from './getTimeAgo';

function logBuildReuse({
  platform,
  binaryInfo: { buildCreatedAt, buildIndex },
}: {
  platform: Platform;
  binaryInfo: BinaryInfo;
}) {
  if (!buildIndex || !buildCreatedAt) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} binary build info is incomplete`,
    });
  }

  logBuildMessage({
    message: `reusing unchanged build (${chalk.green(`Test ${buildIndex}`)}, ${chalk.blue(getTimeAgo(buildCreatedAt))})`,
    type: 'success',
    endsWithNewLine: true,
  });
}

export default logBuildReuse;
