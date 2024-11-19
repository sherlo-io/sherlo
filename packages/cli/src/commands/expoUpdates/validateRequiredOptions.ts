import {
  EXPO_UPDATES_COMMAND,
  CHANNEL_OPTION,
  // EAS_UPDATE_JSON_OUTPUT_OPTION,
} from '../../constants';
import { throwError } from '../../helpers';
import { Options } from '../../types';

const CHANNEL_FLAG = `--${CHANNEL_OPTION}`;
// const EAS_UPDATE_JSON_OUTPUT_FLAG = `--${EAS_UPDATE_JSON_OUTPUT_OPTION}`;

function validateRequiredOptions(
  passedOptions: Options<typeof EXPO_UPDATES_COMMAND, 'withoutDefaults'>
): void {
  if (!passedOptions[CHANNEL_OPTION] /* && !passedOptions[EAS_UPDATE_JSON_OUTPUT_OPTION] */) {
    throwError({
      // message: `either \`${CHANNEL_FLAG}\` or \`${EAS_UPDATE_JSON_OUTPUT_FLAG}\` must be provided`,
      message: `\`${CHANNEL_FLAG}\` flag must be provided`,
      learnMoreLink: 'TODO: DOCS_LINK.expoUpdate',
    });
  } /*  else if (passedOptions[CHANNEL_OPTION] && passedOptions[EAS_UPDATE_JSON_OUTPUT_OPTION]) {
    throwError({
      message: `\`${CHANNEL_FLAG}\` and \`${EAS_UPDATE_JSON_OUTPUT_FLAG}\` cannot be used together`,
      learnMoreLink: 'TODO: DOCS_LINK.expoUpdate',
    });
  } */
}

export default validateRequiredOptions;
