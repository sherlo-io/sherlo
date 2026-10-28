/**
 * WHAT AN UNEXPECTED ERROR PRINTS FOR THE FAULT UNDER IT.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../reporting', () => ({ default: { captureException: vi.fn() } }));

vi.mock('../blankSecrets', () => ({ blankSecrets: (text: string) => text }));

vi.mock('../printLink', () => ({ default: (link: string) => link }));

import throwError from '../throwError';

describe('an unexpected error prints the cause under it', () => {
  it('prints the code, reason and host of the cause Node puts under "fetch failed"', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3000'), {
      code: 'ECONNREFUSED',
      address: '127.0.0.1',
      port: 3000,
    });
    const error = new Error('fetch failed', { cause });

    let printed = '';
    try {
      throwError({ type: 'unexpected', error });
    } catch (thrown) {
      printed = (thrown as Error).message;
    }

    expect(printed).toContain('fetch failed');
    expect(printed).toContain('ECONNREFUSED');
    expect(printed).toContain('127.0.0.1:3000');
  });
});
