import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';

async function waitForEnterPress(): Promise<void> {
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
