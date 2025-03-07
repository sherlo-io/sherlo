import { Build } from '@sherlo/api-types';
import runShellCommand from './runShellCommand';

async function getGitInfo(projectRoot: string): Promise<Build['gitInfo']> {
  try {
    const commitName = await runShellCommand({
      command: 'git log -1 --pretty=format:%s',
      projectRoot,
    });
    const commitHash = await runShellCommand({ command: 'git rev-parse HEAD', projectRoot });
    const branchName = await runShellCommand({
      command: 'git rev-parse --abbrev-ref HEAD',
      projectRoot,
    });

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
