import { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../../constants';
import { BinaryInfo } from '../../../types';
import { emit } from '../../transcriptSink';
import throwError from '../../throwError';
import getTimeAgo from './getTimeAgo';

function printBuildReuse({
  platform,
  binaryInfo: { buildCreatedAt, buildIndex },
  now,
}: {
  platform: Platform;
  binaryInfo: BinaryInfo;
  /** The instant "N minutes ago" is measured against. See ./getTimeAgo. */
  now?: Date;
}) {
  if (!buildIndex || !buildCreatedAt) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} binary build info is incomplete`),
    });
  }

  // `getTimeAgo` reads the wall clock, which the render layer may not do - so the
  // phrase is computed HERE and the segment carries it as a value.
  emit({ kind: 'binary-reused', buildIndex, timeAgo: getTimeAgo(buildCreatedAt, now) });
}

export default printBuildReuse;
