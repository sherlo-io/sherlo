import { Build } from '@sherlo/api-types';
import git from 'git-rev-sync';

function getGitInfo(): Build['gitInfo'] {
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
