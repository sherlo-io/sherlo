import logWarning from './logWarning';

/**
 * `--wait-timeout <minutes>`, as the wait loop wants it.
 *
 * `undefined` means "use the loop's own default", which is what an absent flag
 * and an unusable one both come to: a timeout nobody can parse must not become a
 * timeout of zero, so the value is dropped and the run says so out loud rather
 * than silently waiting for a length nobody asked for.
 *
 * ONE implementation, because three commands now take the flag - both roads of
 * `sherlo test` and `sherlo view` - and the warning text and the "minimum one
 * minute" rule are part of the flag's contract, not of any one road's.
 */
function parseWaitTimeout(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  const minutes = parseInt(raw, 10);

  if (isNaN(minutes) || minutes < 1) {
    logWarning({
      message: `Invalid --wait-timeout "${raw}"; using default 45 minutes.`,
    });
    return undefined;
  }

  return minutes;
}

export default parseWaitTimeout;
