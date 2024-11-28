import { CommandParams, ExpoUpdateData } from '../../../../types';
import { THIS_COMMAND } from '../../constants';
import getExpoMetadata from './getExpoMetadata';
import getExpoUpdateData from './getExpoUpdateData';
import getExpoUpdateInfo from './getExpoUpdateInfo';
import validateExpoUpdateInfo from './validateExpoUpdateInfo';

function getValidatedExpoUpdateData(commandParams: CommandParams<THIS_COMMAND>): ExpoUpdateData {
  const { baseUpdateUrl, slug } = getExpoMetadata(commandParams);

  const expoUpdateInfo = getExpoUpdateInfo(commandParams);

  validateExpoUpdateInfo({ commandParams, expoUpdateInfo });

  const expoUpdateData = getExpoUpdateData({ baseUpdateUrl, slug, expoUpdateInfo });

  return expoUpdateData;
}

export default getValidatedExpoUpdateData;
