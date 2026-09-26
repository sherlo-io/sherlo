import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import { workstation } from '../../../seams/workstation';

/**
 * Stop the setup on "Ready to move on? Press Enter..." so a developer can act on the Storybook
 * Access instructions before the run goes on.
 *
 * THE PROMPT'S BYTES ARE WRITTEN HERE and the keyboard is reached through ../../../seams/workstation:
 * whether there is anybody to ask, and the key they press, are the two things this machine answers
 * and a pose answers instead - the beep, the question, the erase are the tool's own either way.
 */
async function waitForEnterPress(): Promise<void> {
  // Skip the prompt whenever nobody could answer it (piped stdin, or any CI - including one that
  // allocates a pty, where stdin is a tty but an immediate EOF would read as CTRL+D and cancel).
  if (!workstation().somebodyIsAtTheKeyboard()) {
    return;
  }

  // Output a beeping sound
  process.stdout.write(ansiEscapes.beep);

  // Display prompt message
  process.stdout.write('\n' + chalk.bold('👉 Ready to move on? Press Enter...'));

  await workstation().readEnterPress();

  process.stdout.write(ansiEscapes.eraseLines(2) + ansiEscapes.cursorLeft);
}

export default waitForEnterPress;
