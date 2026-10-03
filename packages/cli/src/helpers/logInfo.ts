import { emit } from './transcriptSink';

function logInfo({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  emit({ kind: 'notice', level: 'info', message, ...(learnMoreLink ? { learnMoreLink } : {}) });
}

export default logInfo;
