import fs from 'fs';
import path from 'path';
import { DOCS_LINK, PROJECT_ROOT_OPTION } from '../../constants';
import { throwError } from '../../helpers';

function assertPackageJsonScriptExists({
  projectRoot,
  scriptName,
  errorMessage,
  learnMoreLink,
}: {
  projectRoot: string;
  scriptName: string;
  errorMessage: string;
  learnMoreLink: string;
}) {
  const packageJsonPath = path.resolve(projectRoot, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throwError({
      message: `package.json file not found at location "${projectRoot}" - make sure the directory is correct or pass the \`--${PROJECT_ROOT_OPTION}\` flag to the script`,
      // TODO: link do poprawy
      learnMoreLink: DOCS_LINK.sherloScriptFlags,
    });
  }

  const packageJsonData = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonData);

  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    throwError({
      message: errorMessage,
      learnMoreLink,
    });
  }
}

export default assertPackageJsonScriptExists;
