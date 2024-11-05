import fs from 'fs';
import path from 'path';
import { DOCS_LINK } from '../../constants';
import { throwError } from '../../helpers';

function verifyExpoProject(projectRoot: string): void {
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    throwError({
      message: 'app.json file not found, this command is only for Expo projects',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  // TODO: czy to jest prawda? "expo" jest wymagane?
  if (!appJson.expo || typeof appJson.expo !== 'object') {
    throwError({
      message:
        'this project does not appear to be an Expo project, "expo" property not found or is not an object in app.json',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }
}

export default verifyExpoProject;
