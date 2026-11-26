import { resolveCommand } from 'package-manager-detector';
import { getCwd } from '../../../helpers';
import detectPackageManager from './detectPackageManager';

/**
 * A command in the project's own package manager, as a refusal shows it: `yarn add x`, not `npm
 * install x` for a Yarn project. Detected from the project, like the SDK install.
 */
async function packageManagerCommand(
  intent: 'install' | 'add',
  args: string[] = []
): Promise<string> {
  // `install` and `add` resolve for every manager package-manager-detector knows.
  const { command, args: commandArgs } = resolveCommand(
    await detectPackageManager(getCwd()),
    intent,
    args
  )!;
  return [command, ...commandArgs].join(' ');
}

export default packageManagerCommand;
