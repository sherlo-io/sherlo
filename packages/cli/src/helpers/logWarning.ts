import { emit } from './transcriptSink';

function logWarning({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  emit({ kind: 'notice', level: 'warning', message, ...(learnMoreLink ? { learnMoreLink } : {}) });
}

export default logWarning;
