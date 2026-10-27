import * as Sentry from '@sentry/node';
import { ENV } from '@sherlo/sdk-client';
import { version } from '../../package.json';
import { blankSecrets } from './blankSecrets';
import stripAnsi from './stripAnsi';

const dsn = {
  test: 'https://72524a664c779972513d9381c8637718@o1152742.ingest.us.sentry.io/4508388094574592',
  dev: 'https://72524a664c779972513d9381c8637718@o1152742.ingest.us.sentry.io/4508388094574592',
  prod: 'https://1b7943abebc4ece1377742c907b88ea0@o4507003083292672.ingest.us.sentry.io/4508388097916928',
  // A local stack exists for one test run, so a tool built against it reports nowhere:
  // Sentry.init with no DSN sends nothing.
  local: undefined,
};

const reporting = {
  init: () =>
    Sentry.init({
      dsn: dsn[ENV],
      environment: ENV,
      release: `sherlo-cli@${version}`,
    }),
  setContext: Sentry.setContext,
  setTag: Sentry.setTag,
  addBreadcrumb: Sentry.addBreadcrumb,
  captureException: (error: Error & { location?: string; stdout?: string; stderr?: string }) => {
    blankErrorChain(error);

    if (error.location) Sentry.setExtra('location', error.location);

    if (error.stdout) Sentry.setExtra('stdout', blankSecrets(stripAnsi(error.stdout)));

    if (error.stderr) Sentry.setExtra('stderr', blankSecrets(stripAnsi(error.stderr)));

    Sentry.captureException(error);
  },
  flush: Sentry.flush,
};

/** The single Sentry exit: the message, stack and every cause lose any key before they are sent. */
function blankErrorChain(error: Error) {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    current.message = blankSecrets(current.message);
    if (current.stack) current.stack = blankSecrets(current.stack);
    current = (current as Error & { cause?: unknown }).cause;
  }
}

export default reporting;
