import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { PLATFORM_LABEL } from '../../../constants';
import { BinaryInfo } from '../../../types';
import printBuildMessage from '../../printBuildMessage';
import throwError from '../../throwError';
import getTimeAgo from './getTimeAgo';

function printBuildReuse({
  platform,
  binaryInfo: { buildCreatedAt, buildIndex },
}: {
  platform: Platform;
  binaryInfo: BinaryInfo;
}) {
  if (!buildIndex || !buildCreatedAt) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} binary build info is incomplete`),
    });
  }

  printBuildMessage({
    message: `reusing unchanged build (${chalk.green(`Test ${buildIndex}`)}, ${chalk.blue(
      getTimeAgo(buildCreatedAt)
    )})`,
    type: 'success',
    endsWithNewLine: true,
  });
}

export default printBuildReuse;
