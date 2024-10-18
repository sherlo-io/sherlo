import { Build } from '@sherlo/api-types';
import git from 'git-rev-sync';

function getGitInfo(passedGitInfo?: Build['gitInfo']): Build['gitInfo'] {
  if (passedGitInfo) {
    return passedGitInfo;
  }

  try {
    return {
      commitName: git.message() || 'unknown',
      commitHash: git.long() || 'unknown',
      branchName: git.branch() || 'unknown',
    };
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
