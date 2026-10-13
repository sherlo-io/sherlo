import { Platform } from '@sherlo/api-types';
import { emit } from './transcriptSink';

function printBuildPlatformLabel(platform: Platform) {
  emit({ kind: 'binary-platform-label', platform });
}

export default printBuildPlatformLabel;
