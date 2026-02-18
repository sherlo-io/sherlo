import * as Sentry from '@sentry/node';
import { ENV } from '@sherlo/sdk-client';
import stripAnsi from './stripAnsi';

const dsn = {
  test: 'https://72524a664c779972513d9381c8637718@o1152742.ingest.us.sentry.io/4508388094574592',
  dev: 'https://72524a664c779972513d9381c8637718@o1152742.ingest.us.sentry.io/4508388094574592',
  prod: 'https://1b7943abebc4ece1377742c907b88ea0@o4507003083292672.ingest.us.sentry.io/4508388097916928',
};

const reporting = {
  init: () =>
    Sentry.init({
      dsn: dsn[ENV],
      environment: ENV,
    }),
  setContext: Sentry.setContext,
  captureException: (
    error: Error & { location?: string; stdout?: string; stderr?: string; debugContext?: string }
  ) => {
    if (error.location) Sentry.setExtra('location', error.location);

    if (error.stdout) Sentry.setExtra('stdout', stripAnsi(error.stdout));

    if (error.stderr) Sentry.setExtra('stderr', stripAnsi(error.stderr));

    // TODO(SHERLO-130): temporary — remove once root cause is identified
    if (error.debugContext) Sentry.setExtra('debugContext', error.debugContext);

    Sentry.captureException(error);
  },
  flush: Sentry.flush,
};

export default reporting;
