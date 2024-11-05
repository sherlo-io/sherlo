import fs from 'fs';
import path from 'path';
import { DOCS_LINK } from '../../constants';
import { throwError } from '../../helpers';

// TODO: czy "slug" moze byc zdefiniowany poza "expo" object?
function getExpoSlug(projectRoot: string): string {
  const appJsonPath = path.join(projectRoot, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (!appJson.expo.slug) {
    throwError({
      message: 'expo slug not found in app.json, please add a "slug" property to the "expo" object',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  return appJson.expo.slug;
}

export default getExpoSlug;
