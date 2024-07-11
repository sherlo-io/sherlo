import { main, easBuildOnComplete } from './commands';
import { printHeader } from './helpers';
import { getErrorMessage } from './utils';

async function start() {
  try {
    // TODO: usunac
    console.log('### NEW CLI ###');

    const cliArgument = process.argv[2];

    if (cliArgument === undefined || cliArgument.startsWith('--')) {
      await main();
    } else if (cliArgument === 'eas-build-on-complete') {
      await easBuildOnComplete();
    } else {
      printHeader();

      // TODO: add learnMore link to the CLI documentation
      throw new Error(
        getErrorMessage({ message: `CLI argument \`${cliArgument}\` is not supported` })
      );
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(e.code || 1);
  }
}

export default start;
