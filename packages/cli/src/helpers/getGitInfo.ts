import { Build } from '@sherlo/api-types';
import runShellCommand from './runShellCommand';

async function resolveBranchName(projectRoot: string): Promise<string> {
  // GitHub Actions: GITHUB_HEAD_REF is set on pull_request events (PR source branch)
  const githubHeadRef = process.env.GITHUB_HEAD_REF;
  if (githubHeadRef) return githubHeadRef;

  // GitHub Actions: GITHUB_REF_NAME is set on all events (branch/tag name)
  // On PR events it contains "123/merge" which is not a real branch, so skip those
  const githubRefName = process.env.GITHUB_REF_NAME;
  if (githubRefName && !githubRefName.includes('/merge')) return githubRefName;

  // Local git / fallback
  return await runShellCommand({
    command: 'git rev-parse --abbrev-ref HEAD',
    projectRoot,
  });
}

async function getGitInfo(projectRoot: string): Promise<Build['gitInfo']> {
  try {
    const commitName = await runShellCommand({
      command: 'git log -1 --pretty=format:%s',
      projectRoot,
    });
    const commitHash = await runShellCommand({ command: 'git rev-parse HEAD', projectRoot });
    const branchName = await resolveBranchName(projectRoot);

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
