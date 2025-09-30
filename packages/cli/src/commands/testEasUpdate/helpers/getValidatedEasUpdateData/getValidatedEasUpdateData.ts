import { CommandParams, EasUpdateData } from '../../../../types';
import { THIS_COMMAND } from '../../constants';
import getEasUpdateData from './getEasUpdateData';
import getEasUpdateInfo from './getEasUpdateInfo';
import getExpoMetadata from './getExpoMetadata';
import validateEasUpdateInfo from './validateEasUpdateInfo';

async function getValidatedEasUpdateData(
  commandParams: CommandParams<THIS_COMMAND>
): Promise<EasUpdateData> {
  const { baseUpdateUrl, slug } = await getExpoMetadata(commandParams);

  const easUpdateInfo = await getEasUpdateInfo(commandParams);

  validateEasUpdateInfo({ commandParams, easUpdateInfo });

  const easUpdateData = getEasUpdateData({ baseUpdateUrl, slug, easUpdateInfo });

  return easUpdateData;
}

export default getValidatedEasUpdateData;
