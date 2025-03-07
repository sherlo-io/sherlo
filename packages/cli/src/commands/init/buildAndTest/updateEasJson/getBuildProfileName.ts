import { BUILD_PROFILE } from './constants';

function getBuildProfileName(): string {
  // Assuming there's only one profile in BUILD_PROFILE.build
  return Object.keys(BUILD_PROFILE.build)[0];
}

export default getBuildProfileName;
