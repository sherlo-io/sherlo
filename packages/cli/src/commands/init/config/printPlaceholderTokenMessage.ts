import { printMessage } from '../helpers';
import { TOKEN_PLACEHOLDER } from './constants';

function printPlaceholderTokenMessage(): void {
  printMessage({
    type: 'warning',
    message: `Contains placeholder: ${TOKEN_PLACEHOLDER}`,
  });
}

export default printPlaceholderTokenMessage;
