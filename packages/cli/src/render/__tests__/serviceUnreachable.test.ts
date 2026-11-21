/**
 * WHAT `sherlo init` PRINTS WHEN SHERLO CANNOT BE REACHED: one line naming the address that failed
 * and the network's code, both taken from the real error, then what to check.
 */
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../helpers/stripAnsi';
import { renderServiceUnreachable } from '../initFixes';

describe('the setup stop when Sherlo cannot be reached', () => {
  it('names the failed address and the code in one line', () => {
    const { message, below } = renderServiceUnreachable({
      host: 'api.eu.sherlo.io',
      code: 'ECONNREFUSED',
    });

    expect(stripAnsi(message)).toBe(
      "Setup couldn't reach Sherlo at api.eu.sherlo.io (ECONNREFUSED)."
    );
    expect(stripAnsi(below)).toContain(
      'Check your internet connection, and that no VPN, proxy or firewall blocks it.'
    );
    expect(stripAnsi(below)).not.toContain('ECONNREFUSED');
  });

  it('prints no brackets when the error carries no code', () => {
    const { message } = renderServiceUnreachable({ host: 'api.sherlo.io' });

    expect(stripAnsi(message)).toBe("Setup couldn't reach Sherlo at api.sherlo.io.");
  });
});
