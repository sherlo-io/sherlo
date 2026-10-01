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
 */
export function renderLoginLink(authorizeUrl: string): string[] {
  return ['Log in to Sherlo at this link:', '', `  ${chalk.cyan(authorizeUrl)}`, ''];
}

/** The line the wait opens with, and the one that says the browser did not come up. */
export function renderLoginWaiting(browserOpened: boolean): string[] {
  const waiting = `${chalk.yellow('⏳')} Waiting for you to click Authorize... ${chalk.dim(
    '(Ctrl+C to stop)'
  )}`;

  if (browserOpened) return [waiting];

  return [
    chalk.dim(
      'The browser did not open. The link works on any device, so open it on your phone or another computer.'
    ),
    '',
    waiting,
  ];
}

/** The login is saved: whose it is. */
export function renderLoggedIn(email: string): string[] {
  return ['', `${chalk.green('✔')}  Logged in as ${chalk.bold(email)}`, ''];
}

/** A saved login the service still accepts: no new login is started. */
export function renderAlreadyLoggedIn(email: string): string[] {
  return [
    `${chalk.green('✔')}  Already logged in as ${chalk.bold(email)}`,
    '',
    chalk.dim('Run `sherlo logout` to log out.'),
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
    chalk.dim('Run `sherlo login` to log in.'),
    '',
  ];
}
