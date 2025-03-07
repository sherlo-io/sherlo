import { BUILD_PROFILE } from './constants';
import getBuildProfileName from './getBuildProfileName';

function getBuildProfileConfig(): Record<string, any> {
  const profileName = getBuildProfileName();

  return BUILD_PROFILE.build[profileName];
}

export default getBuildProfileConfig;
