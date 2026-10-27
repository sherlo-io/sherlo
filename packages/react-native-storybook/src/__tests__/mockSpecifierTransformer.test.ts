/**
 * The story transformer withStorybook puts in front of the project's own
 * (metro/mockSpecifierTransformer.js): each `mock(() => import('x'), ...)` in a story file is
 * handed 'x', as the file wrote it, so a mock of a module added after the bundler started names
 * that module when it fails (src/__tests__/mocking/unreachedMocks.test.ts).
 */
import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, fixtureFileWriter } from './bundle/fixtureMetroConfig';

const {
  markMockSpecifiers,
  writeMockSpecifierTransformer,
} = require('../../metro/mockSpecifierTransformer');

const STORY_SOURCE =
  "import { mock } from '@sherlo/react-native-storybook';\n" +
  "import { Inbox } from './Inbox';\n" +
  'export default { component: Inbox };\n' +
  'export const Receipts = {\n' +
  '  parameters: {\n' +
  '    sherlo: {\n' +
  "      mocks: [mock(() => import('components/provider/Chat/receipts'), { receiptCount: () => 5 })],\n" +
  '    },\n' +
  '  },\n' +
  '};\n';

describe('the module a story mocks, handed over at transform time', () => {
  it('a mock in a story file is handed the module its import names, as the story wrote it', () => {
    const marked = markMockSpecifiers('src/Inbox.stories.tsx', STORY_SOURCE);

    expect(marked).toBe(
      STORY_SOURCE.replace(
        '{ receiptCount: () => 5 })',
        '{ receiptCount: () => 5 }, "components/provider/Chat/receipts")'
      )
    );
  });

  it('every mock in the file is handed its own module, and a typed definition keeps its type', () => {
    const source =
      "const a = mock(() => import('../store/inbox.state'), { unread: 1 } as Partial<State>);\n" +
      "const b = Sherlo.mock(function () { return import('./push'); }, (real) => real);\n";

    expect(markMockSpecifiers('.rnstorybook/preview.tsx', source)).toBe(
      'const a = mock(() => import(\'../store/inbox.state\'), { unread: 1 } as Partial<State>, "../store/inbox.state");\n' +
        'const b = Sherlo.mock(function () { return import(\'./push\'); }, (real) => real, "./push");\n'
    );
  });

  it('a file that is not a story or preview file is left as it is', () => {
    const source = "export const declared = mock(() => import('./x'), { a: 1 });\n";

    expect(markMockSpecifiers('src/mocks.ts', source)).toBe(source);
  });

  it('a call that imports no single module, has other than two arguments, or does not parse is left as it is', () => {
    const untouched = [
      'mock(() => import(name), { a: 1 });\n',
      "mock(() => Promise.all([import('./a'), import('./b')]), { a: 1 });\n",
      "mock(() => import('./a'), { a: 1 }, 'already');\n",
      "notMock(() => import('./a'), { a: 1 });\n",
      "mock(() => import('./a'), { a: \n",
    ];

    for (const source of untouched) {
      expect(markMockSpecifiers('src/A.stories.ts', source), source).toBe(source);
    }
  });
});

describe("the transformer in front of the project's own", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createFixtureRoot('sherlo-mock-specifier-');
    // The project's own transformer: it answers with what it was handed.
    fixtureFileWriter(projectRoot)(
      'transformer.js',
      'module.exports = {\n' +
        '  transform: function (args) { return { handed: args }; },\n' +
        "  getCacheKey: function () { return 'project-key'; },\n" +
        '};\n'
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("hands every file to the project's own transformer, a story file with its mocks marked", () => {
    const projectTransformer = path.join(projectRoot, 'transformer.js');
    const transformerPath = writeMockSpecifierTransformer({
      projectRoot,
      transformer: { babelTransformerPath: projectTransformer },
    });
    const transformer = require(transformerPath);

    const story = transformer.transform({
      filename: 'src/Inbox.stories.tsx',
      src: STORY_SOURCE,
      options: {},
    });
    expect(story.handed.src).toContain(
      '{ receiptCount: () => 5 }, "components/provider/Chat/receipts")'
    );

    const appFile = "const x = mock(() => import('./x'), {});\n";
    expect(transformer.transform({ filename: 'src/x.ts', src: appFile, options: {} })).toEqual({
      handed: { filename: 'src/x.ts', src: appFile, options: {} },
    });

    // The cache key is the project's, joined by Sherlo's, so either changing transforms anew.
    expect(transformer.getCacheKey()).toMatch(/^project-key:sherlo-mock-specifiers:[0-9a-f]{64}$/);

    // A config wrapped twice keeps the one transformer, never one handing files to itself.
    expect(
      writeMockSpecifierTransformer({
        projectRoot,
        transformer: { babelTransformerPath: transformerPath },
      })
    ).toBe(transformerPath);
    expect(fs.readFileSync(transformerPath, 'utf8')).toContain(JSON.stringify(projectTransformer));
  });
});
