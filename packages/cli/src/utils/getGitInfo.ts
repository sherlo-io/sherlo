import { Build } from '@sherlo/api-types';
import git from 'git-rev-sync';

function getGitInfo(): Build['gitInfo'] {
  return {
    commitName: git.message(),
    commitHash: git.short(),
    branchName: git.branch(),
  };
}

export default getGitInfo;
