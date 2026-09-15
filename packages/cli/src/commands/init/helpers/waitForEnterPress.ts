import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';

/**
 * Is there a human at the keyboard who could actually press Enter?
 *
 * TWO CONDITIONS, AND THE SECOND ONE IS NOT REDUNDANT. `isTTY` alone answers "is stdin a terminal",
 * which is NOT the same question - plenty of automation runs the CLI under a pseudo-terminal:
 * `docker run -t`, `script(1)`, expect, and any tool that records terminal output. Under one of
 * those, stdin IS a tty and yet nobody is watching. Worse, such a stdin usually reaches EOF
 * immediately, and a pty signals EOF by delivering the end-of-transmission byte (4) - which
 * `handleKeypress` below reads as CTRL+D and treats as a deliberate cancel. So `sherlo init` in a
 * pty-allocating pipeline did not merely hang: it printed the prompt and then failed the setup with
 * "Setup cancelled", leaving no sherlo.config.json behind.
 *
 * `CI` is the standard opt-out every mature CLI honours for exactly this, and it is set by GitHub
 * Actions, GitLab, CircleCI, Travis and Buildkite alike.
 */
function canPromptUser(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

async function waitForEnterPress(): Promise<void> {
  // Skip the prompt whenever nobody could answer it (piped stdin, or any CI - including one that
  // allocates a pty, where stdin is a tty but an immediate EOF would read as CTRL+D and cancel).
  if (!canPromptUser()) {
    return;
  }

  // Output a beeping sound
  process.stdout.write(ansiEscapes.beep);

  // Display prompt message
  process.stdout.write('\n' + chalk.bold('👉 Ready to move on? Press Enter...'));

  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', handleKeypress);
    };

    const handleKeypress = (key: Buffer) => {
      const keyCode = key[0];
      const killCodes = [3, 4, 26, 28]; // CTRL+C, CTRL+D, CTRL+Z, CTRL+\

      if (killCodes.includes(keyCode)) {
        cleanup();
        reject();
        return;
      }

      if (keyCode === 13) {
        // Enter
        cleanup();
        process.stdout.write(ansiEscapes.eraseLines(2) + ansiEscapes.cursorLeft);
        resolve();
      } else {
        process.stdout.write(ansiEscapes.beep);
      }
    };

    process.stdin.on('data', handleKeypress);
  });
}

export default waitForEnterPress;
