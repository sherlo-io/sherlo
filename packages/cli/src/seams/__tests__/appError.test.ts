/** appError.ts reads an error off the capture socket: name and message, and where it came from. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataPathOf, nameWhereItCrashed, readAppError } from '../appError';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading an error the app sent', () => {
  it('an error with no name or message is nothing', () => {
    expect(readAppError({ name: 'E' })).toBeUndefined();
    expect(readAppError(null)).toBeUndefined();
  });

  it('a blank component stack and a stack with no frames are left out', () => {
    expect(readAppError({ name: 'E', message: 'm', componentStack: '  ', stack: 'E: m' })).toEqual({
      name: 'E',
      message: 'm',
    });
  });
});

describe('where a crash happened', () => {
  const BUNDLE_FRAME = 'at render (http://localhost:8081/index.bundle?platform=ios:10:20)';

  it("a crash names the source file and line from the bundle's source map and the data path being read", async () => {
    const bundler = vi.fn(async (_address: string) =>
      Response.json({
        stack: [{ methodName: 'render', file: '/proj/src/Inbox.tsx', lineNumber: 42, column: 7 }],
      })
    );
    vi.stubGlobal('fetch', bundler);

    const named = await nameWhereItCrashed(
      {
        name: 'TypeError',
        message: "undefined is not an object (evaluating 'user.profile.name')",
        topFrames: [BUNDLE_FRAME],
      },
      8081,
      '/proj'
    );

    expect(bundler.mock.calls[0][0]).toBe('http://localhost:8081/symbolicate');
    expect(named).toEqual({
      name: 'TypeError',
      message: "undefined is not an object (evaluating 'user.profile.name')",
      file: 'src/Inbox.tsx',
      line: 42,
      dataPath: 'user.profile.name',
    });
  });

  it("the first frame in the app's own code is the place, not one inside a package", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          stack: [
            { methodName: 'a', file: '/proj/node_modules/lib/index.js', lineNumber: 1, column: 1 },
            { methodName: 'b', file: '/proj/src/Row.tsx', lineNumber: 9, column: 1 },
          ],
        })
      )
    );

    const named = await nameWhereItCrashed(
      { name: 'E', message: 'm', topFrames: [BUNDLE_FRAME, BUNDLE_FRAME] },
      8081,
      '/proj'
    );

    expect(named).toMatchObject({ file: 'src/Row.tsx', line: 9 });
  });

  it('a crash with no frame in the app reads the data path alone', async () => {
    expect(
      await nameWhereItCrashed(
        { name: 'TypeError', message: "Cannot read properties of undefined (reading 'name')" },
        8081,
        '/proj'
      )
    ).toEqual({
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'name')",
      dataPath: 'name',
    });
    expect(dataPathOf('Network request failed')).toBeUndefined();
  });
});
