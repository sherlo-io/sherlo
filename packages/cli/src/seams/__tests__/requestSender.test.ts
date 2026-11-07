import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { explainRefusals } from '../../render/refusalExplanation';
import { senderOf, senderWords } from '../requestSender';
import type { UnansweredRequest } from '../readAppAnswer';
import { nameSendersByCode } from '../senderByCode';
import { symbolicateStacks } from '../symbolicateStack';

const BUNDLE = 'http://localhost:8081/index.bundle?platform=ios&dev=true';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A project folder with the given dependencies, each holding the given files. */
function projectWith(dependencies: Record<string, Record<string, string>>): string {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sender-by-code-'));
  const listed = Object.fromEntries(
    Object.keys(dependencies)
      .filter((name) => !name.startsWith('unlisted-'))
      .map((name) => [name, '1.0.0'])
  );
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: listed }));
  for (const [name, files] of Object.entries(dependencies)) {
    for (const [file, text] of Object.entries(files)) {
      const full = path.join(project, 'node_modules', name, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
  }
  return project;
}

describe('a request is named by its sender', () => {
  it('a request is named by the package on its call stack, else by the package whose code names its host', async () => {
    // The phone's stack names only the bundle; the bundler maps the frame to the file it came from.
    const bundler = vi.fn(async (_address: string) =>
      Response.json({
        stack: [
          {
            methodName: 'track',
            file: '/app/node_modules/@amplitude/analytics-react-native/lib/track.js',
            lineNumber: 3,
            column: 3,
          },
        ],
      })
    );
    vi.stubGlobal('fetch', bundler);
    // The package name shares no word with its host, and its host sits deep in the Android layout.
    const project = projectWith({
      // Request plumbing carries the host too, and is listed first: it is never the sender.
      'react-native': { 'Libraries/Net.js': 'const doc = "https://api.revenuecat.com/v1"' },
      'react-native-purchases': {
        'android/src/main/java/com/revenuecat/purchases/Backend.kt':
          'val base = "https://api.revenuecat.com/v1"',
      },
      'left-pad': { 'index.js': 'module.exports = 1' },
      'unlisted-sdk': { 'index.js': 'fetch("https://api.stray.invalid/x")' },
    });
    const asked: UnansweredRequest[] = [
      { method: 'POST', url: 'https://api.adapty.io/x', stack: `at t (${BUNDLE}:10:20)` },
      { method: 'POST', url: 'https://api.revenuecat.com/v1/events' },
      { method: 'GET', url: 'https://api.stray.invalid/x' },
    ];

    const symbolicated = await symbolicateStacks({ unanswered: asked }, 8081);
    const { unanswered } = nameSendersByCode(symbolicated, project);
    fs.rmSync(project, { recursive: true });

    // The bundler is asked at its own address, once for the one stack.
    expect(bundler).toHaveBeenCalledTimes(1);
    expect(bundler.mock.calls[0][0]).toBe('http://localhost:8081/symbolicate');
    // The symbolicated stack wins over the host table.
    expect(senderOf(unanswered![0])).toEqual({
      library: '@amplitude/analytics-react-native',
      how: 'stack',
    });
    // No stack: the dependency whose code names the host, told as a guess.
    expect(senderOf(unanswered![1])).toEqual({ library: 'react-native-purchases', how: 'code' });
    // A package the app does not depend on is not looked in.
    expect(senderOf(unanswered![2])).toBeUndefined();
    expect(senderWords({ library: 'react-native-purchases', how: 'code' })).toBe(
      'react-native-purchases (its code names the host)'
    );
  });

  it("a story's socket fake that refused prints the story's file and line", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          stack: [
            { methodName: 'stories', file: '/app/src/Feed.stories.tsx', lineNumber: 12, column: 5 },
          ],
        })
      )
    );

    const symbolicated = await symbolicateStacks(
      {
        unanswered: [
          {
            method: 'WS',
            url: 'wss://live.app.example/feed',
            rule: 'fake-refused',
            fakeAt: `at stories (${BUNDLE}:900:5)`,
          },
        ],
      },
      8081
    );

    expect(explainRefusals(symbolicated.unanswered)?.causes[0].rules).toEqual([
      'a fake of yours refused it (declared at /app/src/Feed.stories.tsx:12)',
    ]);
  });

  it('a stack the bundler cannot map stays as the app sent it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      })
    );
    const stack = `at t (${BUNDLE}:10:20)`;

    const { unanswered } = await symbolicateStacks(
      { unanswered: [{ method: 'GET', url: 'https://app.example/x', stack }] },
      8081
    );

    expect(unanswered![0].stack).toBe(stack);
  });

  it('the stack names the package past Sherlo and React Native, and the host table is the last fallback', () => {
    const stack = [
      'at refusalMarks (/app/node_modules/@sherlo/react-native-storybook/src/mocking/networkRules.ts:1:1)',
      'at fetch (/app/node_modules/react-native/Libraries/Network/fetch.js:2:2)',
      'at track (/app/node_modules/@amplitude/analytics-react-native/lib/track.js:3:3)',
    ].join('\n');

    expect(senderOf({ url: 'https://api.adapty.io/x', stack })).toEqual({
      library: '@amplitude/analytics-react-native',
      how: 'stack',
    });
    expect(senderOf({ url: 'https://api.adapty.io/x' })).toEqual({
      library: 'react-native-adapty',
      how: 'host',
    });
    // A stack of the app's own code names no package, and an unknown host names none either.
    expect(
      senderOf({ url: 'https://app.example/x', stack: 'at load (/app/src/Home.tsx:1:1)' })
    ).toBeUndefined();
  });
});
