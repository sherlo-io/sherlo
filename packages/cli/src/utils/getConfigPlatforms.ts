import { Platform } from '@sherlo/api-types';
import { Config } from '../types';

function getConfigPlatforms(config: Config): Platform[] {
  const result: Platform[] = [];

  if (config.android) result.push('android');
  if (config.ios) result.push('ios');

  return result;
}

export default getConfigPlatforms;
