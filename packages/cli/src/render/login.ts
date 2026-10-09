/**
 * WHAT `sherlo login` AND `sherlo logout` PRINT when they end well (sherlo / Logging in from the
 * terminal). The endings that exit 1 - a cancelled or expired login, a logout the service could not
 * hear - are refusals, and print through the entry point like every refusal.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * THE LOGIN TOKEN IS NOT AN INPUT TO ANY RENDERER HERE, and never will be. The tool saves it and
 * never prints it; a renderer that cannot be handed the token cannot print it.
 *
 * The words are the content department's; the shapes - the link alone on its line, one line
 * naming the person - are the pages'.
 */
import chalk from 'chalk';

/**
 * The authorize link, alone on its own line, printed BEFORE the browser is asked to open it - so a
 * person on another machine, or an agent passing it on, has it whether or not a browser comes up.
 * It says the browser is about to open, so the new tab is no surprise.
 */
export function renderLoginLink(authorizeUrl: string): string[] {
  return [
    'Opening your browser to log in to Sherlo...',
    chalk.dim("If it doesn't open, use this link on any device:"),
    '',
    `  ${chalk.cyan(authorizeUrl)}`,
    '',
  ];
}

/**
 * The wait on a terminal: the text of a spinner the result replaces. The spinner draws its own
 * frame where the plain line below has its hourglass. The same text whether or not the browser
 * came up, because the link above already says what to do when it did not.
 */
export function renderLoginWaitingSpinner(): string {
  return `Waiting for you to click Authorize... ${chalk.dim('(Ctrl+C to stop)')}`;
}

/**
 * The wait anywhere but a terminal - a log, a pipe, an agent's shell - where a spinner would leave
 * nothing readable. The line stays, and the one under it tells an agent it may leave the command
 * running in the background while the person clicks, and that a rerun waits on the same link.
 */
export function renderLoginWaiting(): string[] {
  return [
    `${chalk.yellow('⏳')} Waiting for you to click Authorize... ${chalk.dim('(Ctrl+C to stop)')}`,
    chalk.dim(
      'An agent may run this in the background while the person clicks. Running it again waits on the same link.'
    ),
  ];
}

/**
 * The login is saved: whose it is, and the command a person runs next - unless the login was made
 * inside setup, which is that command already.
 */
export function renderLoggedIn(email: string, insideSetup?: true): string[] {
  const loggedInLine = `${chalk.green('✔')}  Logged in as ${chalk.bold(email)}`;
  if (insideSetup) return [loggedInLine, ''];

  return [
    loggedInLine,
    '',
    chalk.dim('Next: run `npx sherlo init` in your React Native app to set up Sherlo.'),
    '',
  ];
}

/** A saved login the service still accepts: no new login is started. */
export function renderAlreadyLoggedIn(email: string): string[] {
  return [
    `${chalk.green('✔')}  Already logged in as ${chalk.bold(email)}`,
    '',
    chalk.dim('Run `npx sherlo logout` to log out.'),
    '',
  ];
}

/** The login is ended on the service and deleted from this computer. */
export function renderLoggedOut(email: string): string[] {
  return [`${chalk.green('✔')}  Logged out ${chalk.bold(email)}`, ''];
}

/** No login is saved for this service address: nothing to end. */
export function renderNotLoggedIn(): string[] {
  return [
    `${chalk.yellow('◦')}  Not logged in`,
    '',
    chalk.dim('Run `npx sherlo login` to log in.'),
    '',
  ];
}
