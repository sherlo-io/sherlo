/**
 * Converts the validated `--maxWaitTime` string option into the number
 * `runWaitLoop` expects. Validation (integer >= 1) already happened in
 * `validateMaxWaitTime` - this is a pure format conversion.
 */
function parseMaxWaitTime(maxWaitTime?: string): number | undefined {
  return maxWaitTime !== undefined ? Number(maxWaitTime) : undefined;
}

export default parseMaxWaitTime;
