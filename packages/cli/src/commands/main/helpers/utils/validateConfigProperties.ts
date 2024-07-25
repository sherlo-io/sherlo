import { DOCS_LINK } from '../../../../constants';
import { logWarning } from '../../../../utils';
import { InvalidatedConfig } from '../../types';

const supportedProperties = ['android', 'devices', 'ios', 'token'];

function validateConfigProperties(config: InvalidatedConfig): void {
  const unsupportedProperties = Object.keys(config).filter(
    (property) => !supportedProperties.includes(property)
  );

  unsupportedProperties.forEach((property) => {
    logWarning({
      type: 'config',
      message: `property "${property}" is not supported`,
      learnMoreLink: DOCS_LINK.configProperties,
    });
  });
}

export default validateConfigProperties;
