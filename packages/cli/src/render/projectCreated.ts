/**
 * WHAT `sherlo project create` PRINTS, and - much more importantly - WHAT IT
 * DOES NOT.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the CLI never prints a whole API
 * response. `createProject` answers with the new project AND its plaintext
 * project token, and the failure mode that matters here is not a clever attack
 * - it is a CI job whose log now contains a live credential because the command
 * that made it dumped its response. So this renderer takes THREE named values
 * (name, index, projectToken) and can physically not print a fourth: an api
 * field added tomorrow does not appear in a log tomorrow.
 *
 * THE PERSONAL TOKEN IS NOT AMONG THEM, and never will be. It is the caller's
 * own long-lived credential; it was on the command line, it does not need to be
 * on the screen, and there is no version of "helpfully echoing it" that is
 * worth a leak.
 *
 * WHY THE PROJECT TOKEN IS PRINTED AT ALL. It is the entire product of the
 * command and it is returned exactly once - there is no re-fetch, and recovery
 * is an owner-only reset in the web app. A command that created a credential
 * and then hid it would just mean running the command twice. So it is printed
 * ONCE, alone on its own line, under a sentence that says plainly that it will
 * not be shown again.
 *
 * WHY IT IS NOT A `key=value` LINE. Those lines (../render/pushSpine's
 * renderOutputKeys) exist for CI to scrape and republish, which is precisely
 * the journey a secret must not be put on. The two facts that ARE safe to
 * republish - the project's name and index - are emitted as key=value; the
 * token is deliberately shaped so that a script grepping `=` does not pick it
 * up by accident.
 */
import chalk from 'chalk';
import { renderOutputKeys } from './pushSpine';

/** What the service answers when a project is made. */
export type ProjectCreated = {
  name: string;
  index: number;
  /** BUILD DEBT (init-for-agents): the service stops making a token with a project; this goes. */
  projectToken?: string;
};

/**
 * NO TOKEN COMES WITH A NEW PROJECT ANY MORE (operator, 2026-10-07, epic init-for-agents): a person
 * works from their own computer on their login, and only CI needs a token, so one is made when
 * someone presses Create Token on the project's page. The command names that page instead.
 */
export type ProjectCreatedLines = ProjectCreated & {
  /** The project's page in the web app, where its CI token is made. */
  projectPageUrl: string;
};

/** Every line the command prints on success, in order. */
export function renderProjectCreated({ name, index, projectPageUrl }: ProjectCreatedLines): string[] {
  return [
    `${chalk.green('✔')}  Created project ${chalk.bold(name)}`,
    '',
    ...renderOutputKeys({ projectIndex: index, projectName: name }),
    '',
    `For CI, create a CI token on the project's page and save it as the ${chalk.bold('SHERLO_TOKEN')} secret:`,
    `  ${chalk.cyan(projectPageUrl)}`,
    '',
  ];
}
