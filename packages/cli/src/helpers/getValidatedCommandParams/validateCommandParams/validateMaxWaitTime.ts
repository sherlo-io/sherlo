import { MAX_WAIT_TIME_OPTION } from '../../../constants';
import throwError from '../../throwError';

function validateMaxWaitTime(commandParams: { [MAX_WAIT_TIME_OPTION]?: string }): void {
  const { maxWaitTime } = commandParams;

  if (maxWaitTime === undefined) return;

  const parsed = Number(maxWaitTime);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throwError({
      message:
        `Invalid \`--${MAX_WAIT_TIME_OPTION}\` value \`${maxWaitTime}\`. ` +
        'Must be an integer of at least 1 (minutes)',
    });
  }
}

export default validateMaxWaitTime;
