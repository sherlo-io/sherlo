import { DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';

// `token` is not here: a config that still holds one is refused before this runs
// (resolvePushCredential), so it is never merely warned about.
const supportedProperties = [
  'project',
  'android',
  'ios',
  'devices',
  'include',
  'exclude',
  'simulation',
  'build',
];

function validateConfigProperties(config: InvalidatedConfig): void {
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
