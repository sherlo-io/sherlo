import { DOCS_LINK } from '../../../constants';
import { renderBinaryPathFlagGone } from '../../../render/appBuild';
import { InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';
import throwError from '../../throwError';

// `token` is not here: a config that still holds one is refused before this runs
// (resolvePushCredential), so it is never merely warned about. `android` and `ios` are not here
// either: they are Sherlo 2 binary paths, refused below.
const supportedProperties = ['project', 'devices', 'include', 'exclude', 'simulation', 'build'];

function validateConfigProperties(config: InvalidatedConfig): void {
  // The same words as `--android` and `--ios`: a leftover path never looks like the app tested.
  if (config.android !== undefined || config.ios !== undefined) {
    throwError(renderBinaryPathFlagGone());
  }

  const unsupportedProperties = Object.keys(config).filter(
    (property) => !supportedProperties.includes(property)
  );

  unsupportedProperties.forEach((property) => {
    logWarning({
      message: `Unsupported property \`${property}\` in config file (supported: \`${supportedProperties.join(
        '`, `'
      )}\`)`,
      learnMoreLink: DOCS_LINK.configProperties,
    });

    console.log();
  });
}

export default validateConfigProperties;
