import { Platform } from '@sherlo/api-types';
import { BaseConfig } from '../../types';

function getConfigPlatforms(config: BaseConfig): Platform[] {
  const result: Platform[] = [];

  if (config.apps.android) result.push('android');
  if (config.apps.ios) result.push('ios');

  return result;
}

export default getConfigPlatforms;
