import { Platform } from '@sherlo/api-types';
import { BaseConfig, Config } from '../types';

function getConfigPlatforms(config: BaseConfig): Platform[] {
  const result: Platform[] = [];

  if (config.android) result.push('android');
  if (config.ios) result.push('ios');

  return result;
}

export default getConfigPlatforms;
