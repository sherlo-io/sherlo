import { Build } from '@sherlo/api-types';
import { runShellCommand } from './runShellCommand';

function getGitInfo(projectRoot: string): Build['gitInfo'] {
  try {
    const commitName = runShellCommand({ command: 'git log -1 --pretty=format:%s', projectRoot });
    const commitHash = runShellCommand({ command: 'git rev-parse HEAD', projectRoot });
    const branchName = runShellCommand({ command: 'git rev-parse --abbrev-ref HEAD', projectRoot });

    return { commitName, commitHash, branchName };
  } catch (error) {
    console.warn("Couldn't get git info", error);

    return {
      commitName: 'unknown',
      commitHash: 'unknown',
      branchName: 'unknown',
    };
  }
}

export default getGitInfo;
