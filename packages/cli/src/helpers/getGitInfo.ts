import { Build } from '@sherlo/api-types';
import { execSync } from 'child_process';

function getGitInfo(): Build['gitInfo'] {
  try {
    return {
      commitName: execSync('git log -1 --pretty=format:%s').toString().trim() || 'unknown',
      commitHash: execSync('git rev-parse HEAD').toString().trim() || 'unknown',
      branchName: execSync('git rev-parse --abbrev-ref HEAD').toString().trim() || 'unknown',
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
