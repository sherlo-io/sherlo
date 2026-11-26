import { resolveCommand } from 'package-manager-detector';
import { getCwd } from '../../../helpers';
import detectPackageManager from './detectPackageManager';

/**
 * A command in the project's own package manager, as a refusal shows it: `yarn add x`, not `npm
 * install x` for a Yarn project. Detected from the project, like the SDK install; npm when nothing
 * says otherwise.
 */
async function packageManagerCommand(
  intent: 'install' | 'add',
  args: string[] = []
): Promise<string> {
  const packageManager = (await detectPackageManager(getCwd())) ?? 'npm';
  const resolved = resolveCommand(packageManager, intent, args);

  return resolved
    ? [resolved.command, ...resolved.args].join(' ')
    : `npm ${intent} ${args.join(' ')}`.trim();
}

export default packageManagerCommand;
