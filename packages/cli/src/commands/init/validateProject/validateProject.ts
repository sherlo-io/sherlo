import { APP_DOMAIN } from '../../../constants';
import { isValidToken, printLink, throwError, validatePackages } from '../../../helpers';
import { THIS_COMMAND } from '../constants';
import { ProjectType } from '../types';
import getProjectType from './getProjectType';
import validateStorybook from './validateStorybook';

async function validateProject(token?: string): Promise<{ projectType: ProjectType }> {
  let projectType;

  try {
    projectType = await getProjectType();

    await validateStorybook();

    validatePackages(THIS_COMMAND);

    if (token && !isValidToken(token)) {
      throwError({
        message:
          'Invalid `--token`. Make sure you copied it correctly or generate a new one at ' +
          printLink(APP_DOMAIN),
      });
    }
  } catch (error) {
    console.log();

    throw error;
  }

  return { projectType };
}

export default validateProject;
