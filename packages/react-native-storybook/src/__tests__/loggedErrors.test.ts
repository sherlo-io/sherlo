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

  it('an Apollo error link is kept as its decoded code and arguments, not as the link', async () => {
    const { loggedErrors } = await installedKeeper();
    const link = (data: string) =>
      `An error occurred! For more details, see the full error text at https://go.apollo.dev/c/err#${data}`;
    const encoded = encodeURIComponent(
      JSON.stringify({ version: '3.12.7', message: 12, args: ['Account', 'displayName', 7] })
    );
    const notDecoding = link('%7Bnot-json');

    console.error(link(encoded));
    console.error(notDecoding);

    expect(loggedErrors().messages.map((entry) => entry.message)).toEqual([
      'Apollo Client error 12: Account, displayName, 7',
      notDecoding.slice(0, 200),
    ]);
  });

  it('an Apollo link is decoded on the first line only, and only when its JSON has a code and arguments', async () => {
    const { loggedErrors } = await installedKeeper();
    const link = (data: object) =>
      `https://go.apollo.dev/c/err#${encodeURIComponent(JSON.stringify(data))}`;
    const valid = { version: '3.12.7', message: 5, args: ['Query', 'name'] };
    const secondLine = `Foo failed\n see ${link(valid)}`;
    const noCode = `see ${link({ version: '3.12.7', args: ['a'] })}`;
    const noArgs = `see ${link({ version: '3.12.7', message: 5 })}`;
    const longArgs = `see ${link({ message: 9, args: ['x'.repeat(300)] })}`;

    console.error(`Cache miss, see ${link(valid)}`);
    console.error(secondLine);
    console.error(noCode);
    console.error(noArgs);
    console.error(longArgs);

    expect(loggedErrors().messages.map((entry) => entry.message)).toEqual([
      'Apollo Client error 5: Query, name',
      'Foo failed',
      noCode,
      noArgs,
      `Apollo Client error 9: ${'x'.repeat(300)}`.slice(0, 200),
    ]);
  });
});
