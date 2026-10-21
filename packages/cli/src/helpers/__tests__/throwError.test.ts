import { describe, expect, it, vi } from 'vitest';
import { BLANKED } from '../blankSecrets';
import reporting from '../reporting';
import throwError from '../throwError';

const PROJECT_KEY = `${'a'.repeat(32)}k3j9x2ab4`;

function caught(run: () => never): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('nothing was thrown');
}

describe('the error a command throws', () => {
  it('a project key inside the message is blanked while the rest of the text stays', () => {
    const error = caught(() =>
      throwError({
        message: `Request failed for token ${PROJECT_KEY}: 401`,
        above: 'Before the error',
        below: 'Check your token',
      })
    );

    expect(error.message).not.toContain(PROJECT_KEY);
    expect(error.message).toContain(`Request failed for token ${BLANKED}: 401`);
    expect(error.message).toContain('Before the error');
    expect(error.message).toContain('Check your token');
  });

  it('a project key inside an unexpected error is blanked while the label and output stay', () => {
    vi.spyOn(reporting, 'captureException').mockImplementation(() => {});
    const unexpected = Object.assign(new Error(`Upload failed for ${PROJECT_KEY}`), {
      stderr: 'exit code 1',
    });

    const error = caught(() => throwError({ type: 'unexpected', error: unexpected }));

    expect(error.message).not.toContain(PROJECT_KEY);
    expect(error.message).toContain(`Upload failed for ${BLANKED}`);
    expect(error.message).toContain('UNEXPECTED ERROR');
    expect(error.message).toContain('exit code 1');
  });
});
