import { afterEach, describe, expect, it, vi } from 'vitest';

const original = console.error;

afterEach(() => {
  console.error = original;
  vi.resetModules();
});

async function installedKeeper() {
  const sink = vi.fn();
  console.error = sink;
  const { startKeepingLoggedErrors, loggedErrors } = await import('../loggedErrors');
  startKeepingLoggedErrors();
  return { sink, loggedErrors };
}

describe('the errors the app logs during a scene', () => {
  it('errors the app logs are kept as distinct messages with counts, at most five, and the rest counted', async () => {
    const { sink, loggedErrors } = await installedKeeper();

    console.error('same');
    console.error('same');
    for (const name of ['b', 'c', 'd', 'e', 'f', 'g', 'h']) console.error(name);

    expect(loggedErrors()).toEqual({
      messages: [
        { message: 'same', times: 2 },
        { message: 'b', times: 1 },
        { message: 'c', times: 1 },
        { message: 'd', times: 1 },
        { message: 'e', times: 1 },
      ],
      moreLeftOut: 3,
    });
    // The app's own logging is unchanged: every call still reaches what was there before.
    expect(sink).toHaveBeenCalledTimes(9);
  });

  it('only the first argument is kept: an Error by name and message, a string as it is, anything else left out', async () => {
    const { loggedErrors } = await installedKeeper();

    console.error(new TypeError('no token'), 'second argument is never kept');
    console.error('  first line  \nsecond line');
    console.error('x'.repeat(250));
    console.error({ body: 'secret request body' });
    console.error(42);
    console.error();
    console.error('@sherlo/react-native-storybook: its own line');
    console.error('Sherlo: its own line');

    expect(loggedErrors()).toEqual({
      messages: [
        { message: 'TypeError: no token', times: 1 },
        { message: 'first line', times: 1 },
        { message: 'x'.repeat(200), times: 1 },
      ],
      moreLeftOut: 0,
    });
  });

  it('console.error is wrapped once however often the keeping is started', async () => {
    const { loggedErrors } = await installedKeeper();
    const { startKeepingLoggedErrors } = await import('../loggedErrors');
    startKeepingLoggedErrors();

    console.error('once');

    expect(loggedErrors().messages).toEqual([{ message: 'once', times: 1 }]);
  });
});
