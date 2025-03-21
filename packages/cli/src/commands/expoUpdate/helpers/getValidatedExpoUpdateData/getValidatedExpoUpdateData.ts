import { CommandParams, ExpoUpdateData } from '../../../../types';
import { THIS_COMMAND } from '../../constants';
import getExpoMetadata from './getExpoMetadata';
import getExpoUpdateData from './getExpoUpdateData';
import getExpoUpdateInfo from './getExpoUpdateInfo';
import validateExpoUpdateInfo from './validateExpoUpdateInfo';

async function getValidatedExpoUpdateData(
  commandParams: CommandParams<THIS_COMMAND>
): Promise<ExpoUpdateData> {
  const { baseUpdateUrl, slug } = await getExpoMetadata(commandParams);

  const expoUpdateInfo = await getExpoUpdateInfo(commandParams);

  validateExpoUpdateInfo({ commandParams, expoUpdateInfo });

  const expoUpdateData = getExpoUpdateData({ baseUpdateUrl, slug, expoUpdateInfo });

  return expoUpdateData;
}

export default getValidatedExpoUpdateData;
