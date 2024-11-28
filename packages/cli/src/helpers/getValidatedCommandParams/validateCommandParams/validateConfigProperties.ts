import { DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';

const supportedProperties = ['token', 'android', 'ios', 'devices'];

function validateConfigProperties(config: InvalidatedConfig): void {
  const unsupportedProperties = Object.keys(config).filter(
    (property) => !supportedProperties.includes(property)
  );

  unsupportedProperties.forEach((property) => {
    logWarning({
      message: `Unsupported property \`${property}\` in config file (supported: \`${supportedProperties.join('`, `')}\`)`,
      learnMoreLink: DOCS_LINK.configProperties,
    });
  });
}

export default validateConfigProperties;
