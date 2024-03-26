import { Build } from '@sherlo/api-types';
import git from 'git-rev-sync';

function getGitInfo(): Build['gitInfo'] {
  return {
    commitName: git.message() || 'unknown',
    commitHash: git.long() || 'unknown',
    branchName: git.branch() || 'unknown',
  };
}

export default getGitInfo;
