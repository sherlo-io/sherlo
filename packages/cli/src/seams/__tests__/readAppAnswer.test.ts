/**
 * The small readers of the app's answer (readAppAnswer.ts): what a list of strings and a list of
 * unanswered requests become when the wire sent them well, badly, or not at all.
 */
import { describe, expect, it } from 'vitest';
import { unusedFakeLine } from '../../../../react-native-storybook/src/mocking/unusedFakeLine';
import { keptLeft, readStrings, readUnanswered } from '../readAppAnswer';

describe('what the app says of a scene reaches the scene’s record', () => {
  it('an unused fake and a partial fake’s missing fields reach the scene’s record', () => {
    const partialMessage =
      'A scene read "isAnonymous" of a partial object, and the scene does not name it. Add it to the partial.';
    const left = keptLeft({
      loggedErrors: {
        messages: [
          { message: unusedFakeLine('pkg/analytics', 'shared setup'), times: 1 },
          { message: partialMessage, times: 1 },
        ],
        moreLeftOut: 0,
      },
    });

    expect(left.mockNotApplied).toEqual([{ module: 'pkg/analytics' }]);
    expect(left.loggedErrors?.messages).toEqual([{ message: partialMessage, times: 1 }]);
  });
});

describe('reading a list of strings off the wire', () => {
  it('a list of strings is kept and a list with nothing readable in it reads as nothing', () => {
    expect(readStrings(['src/api.ts', 'src/auth.ts'])).toEqual(['src/api.ts', 'src/auth.ts']);
    expect(readStrings([])).toBeUndefined();
    expect(readStrings([1, null, {}])).toBeUndefined();
  });

  it('a value that is not a list reads as nothing', () => {
    expect(readStrings(undefined)).toBeUndefined();
    expect(readStrings('src/api.ts')).toBeUndefined();
  });

  it('a list mixing strings with other values keeps only the strings', () => {
    expect(readStrings(['a', 2, 'b'])).toEqual(['a', 'b']);
  });
});

describe('reading the requests no mock answered', () => {
  it('each request keeps its method and its address', () => {
    expect(readUnanswered([{ method: 'GET', url: 'https://x.test/a', extra: 1 }])).toEqual([
      { method: 'GET', url: 'https://x.test/a' },
    ]);
  });

  it('a malformed entry is dropped and the well-formed ones stay', () => {
    expect(
      readUnanswered([null, { method: 'GET' }, { method: 'POST', url: 'https://x.test/b' }])
    ).toEqual([{ method: 'POST', url: 'https://x.test/b' }]);
  });

  it('a value that is not a list, or a list with no readable entry, reads as nothing', () => {
    expect(readUnanswered(undefined)).toBeUndefined();
    expect(readUnanswered({ method: 'GET', url: 'u' })).toBeUndefined();
    expect(readUnanswered([null, 3])).toBeUndefined();
    expect(readUnanswered([])).toBeUndefined();
  });
});
