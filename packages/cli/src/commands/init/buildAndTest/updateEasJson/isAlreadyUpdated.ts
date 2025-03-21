import getBuildProfileConfig from './getBuildProfileConfig';
import getBuildProfileName from './getBuildProfileName';
import hasEasJsonFile from './hasEasJsonFile';
import readEasJson from './readEasJson';

async function isAlreadyUpdated(): Promise<boolean> {
  if (!hasEasJsonFile()) return false;

  const easJson = await readEasJson();
  const profileName = getBuildProfileName();
  const profileConfig = getBuildProfileConfig();

  if (!easJson.build?.[profileName]) return false;

  const existingProfile = easJson.build[profileName];

  // Check if all platforms from configuration exist and have correct values
  for (const platformName of Object.keys(profileConfig)) {
    const expectedPlatformConfig = profileConfig[platformName];
    const actualPlatformConfig = existingProfile[platformName];

    if (!actualPlatformConfig) return false;

    // Check if all platform properties match expected values
    for (const configKey of Object.keys(expectedPlatformConfig)) {
      if (actualPlatformConfig[configKey] !== expectedPlatformConfig[configKey]) {
        return false;
      }
    }
  }

  return true;
}

export default isAlreadyUpdated;
