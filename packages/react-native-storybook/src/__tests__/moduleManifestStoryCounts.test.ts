'use strict';

/**
 * The module manifest records, per story file, the title Storybook shows AND the number of
 * stories it holds. The oracle is Storybook's own code: the file is compiled and evaluated, and
 * `userOrAutoTitleFromSpecifier` + `isExportStory` (the two functions
 * @storybook/react-native's prepareStories calls) say what the web app shows.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';

const { transformSync } = require('esbuild');
const { isExportStory } = require('storybook/internal/csf');
const { userOrAutoTitleFromSpecifier } = require('storybook/internal/preview-api');
const applySherloTransforms = require('../../metro/applySherloTransforms');

const FILES: Record<string, string> = {
  // declared title, default-export object literal, 2 stories
  'src/components/Sanity/Hello.stories.tsx': `export default { title: 'Sanity/Hello' };
export const Empty = {};
export const Filled = { args: {} };`,
  // no title: auto-generated from the path; repeated folder name collapses
  'src/components/Button/Button.stories.tsx': `export default { component: null };
export const Primary = {};
export const Secondary = () => null;
export function Tertiary() { return null; }`,
  // no title, "stories.tsx" file name collapses into the folder
  'src/components/Card/stories.tsx': `const meta = { component: null };
export default meta;
export const A = {};`,
  // no title, plain file name, nested folder
  'src/screens/Login.stories.tsx': `export default {};
export const Default = {};
export const Error = {};`,
  // const meta with satisfies, declared title
  'src/components/PriceTag.stories.tsx': `const meta = { title: 'Storefront/PriceTag' } satisfies object;
export default meta;
export const One = {};
export { One as Alias };`,
  // includeStories regex
  'src/inc/Inc.stories.tsx': `export default { includeStories: /^Show/ };
export const ShowA = {};
export const ShowB = {};
export const Hidden = {};`,
  // excludeStories array + helper export
  'src/exc/Exc.stories.tsx': `export default { title: 'Exc', excludeStories: ['helper'] };
export const helper = () => 1;
export const S1 = {};`,
  // Storybook's csf quirk: a truthy __namedExportsOrder counts as a story
  'src/order/Order.stories.tsx': `export default { title: 'Order' };
export const A = {};
export const B = {};
export const __namedExportsOrder = ['B', 'A'];`,
  // computed title: title unknowable, count still readable
  'src/computed/Computed.stories.tsx': `const t = (s: string) => s;
export default { title: t('Computed') };
export const A = {};
export const B = {};`,
  // export * : the count needs evaluation
  'src/star/Star.stories.tsx': `export * from './shared';
export default { title: 'Star' };
export const A = {};`,
  'src/star/shared.ts': `export const Shared = {};`,
  // no default export: Storybook skips the file
  'src/nodefault/NoDefault.stories.tsx': `export const A = {};`,
  // falsy export: not a story
  'src/falsy/Falsy.stories.tsx': `export default { title: 'Falsy' };
export const A = {};
export const Off = undefined;`,
};

const STORY_FILES = Object.keys(FILES).filter(
  (rel) => rel.endsWith('.stories.tsx') || rel.endsWith('/stories.tsx')
);

function storybookAnswer(root: string, rel: string): { title: string; count: number } {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const js = transformSync(source, { loader: 'tsx', format: 'cjs' }).code;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  // The only import is ./shared, which exports one story-like value.
  vm.runInNewContext(`(function (module, exports, require) {${js}\n})`)(mod, mod.exports, () => ({
    Shared: {},
  }));
  const exportsObject = mod.exports as Record<string, unknown> & { default?: any };
  if (!exportsObject.default) return { title: '(file skipped)', count: 0 };
  const specifier = {
    titlePrefix: '',
    directory: './src',
    files: '**/*.stories.tsx',
    importPathMatcher: /(?:^|[./])stories\.tsx$/,
  };
  const key = './' + rel.replace(/^src\//, '');
  const title = userOrAutoTitleFromSpecifier(key, specifier, exportsObject.default.title).replace(
    './',
    ''
  );
  const count = Object.keys(exportsObject).filter(
    (k) => k !== 'default' && isExportStory(k, exportsObject.default) && exportsObject[k]
  ).length;
  return { title, count };
}

describe('the module manifest records each story file title and story count', () => {
  it('matches what Storybook itself shows, file by file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-story-counts-'));
    Object.entries(FILES).forEach(([rel, source]) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), source);
    });
    fs.mkdirSync(path.join(root, '.rnstorybook'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.rnstorybook', 'storybook.requires.ts'),
      `const normalizedStories = [{ titlePrefix: "", directory: "./src", files: "**/*.stories.tsx",
  importPathMatcher: /\\.stories\\.tsx$/, req: require.context('../src', true, /\\.stories\\.tsx$/) }];`
    );

    const storyDeps = new Map<string, unknown>();
    const dependencies = new Map<string, any>();
    const ctxPath = `${path.join(root, 'src')}?ctx=0123456789abcdef`;
    STORY_FILES.forEach((rel, i) => {
      const abs = path.join(root, rel);
      storyDeps.set(`s${i}`, { absolutePath: abs, data: { data: {} } });
      dependencies.set(abs, { output: [{ data: { code: `S${i}` } }], dependencies: new Map() });
    });
    dependencies.set(ctxPath, { output: [{ data: { code: 'CTX' } }], dependencies: storyDeps });
    dependencies.set(path.join(root, '.rnstorybook', 'storybook.requires.ts'), {
      output: [{ data: { code: 'REQ' } }],
      dependencies: new Map([
        ['ctx', { absolutePath: ctxPath, data: { data: { contextParams: {} } } }],
      ]),
    });

    process.env.SHERLO_MODULE_MANIFEST = '1';
    try {
      const result = applySherloTransforms(
        { projectRoot: root, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
        { enabled: true }
      );
      result.serializer.customSerializer('index.js', [], { dependencies }, { projectRoot: root });
    } finally {
      delete process.env.SHERLO_MODULE_MANIFEST;
    }
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, 'node_modules', '.cache', 'sherlo', 'module-manifest.json'),
        'utf8'
      )
    );

    const table = STORY_FILES.map((rel) => {
      const key = './' + rel;
      return {
        file: rel,
        recordedTitle: manifest.storyTitles[key] ?? null,
        recordedCount: manifest.storyCounts[key] ?? null,
        ...storybookAnswer(root, rel),
      };
    });
    fs.rmSync(root, { recursive: true, force: true });

    table.forEach((row) => {
      // Known = must equal Storybook. Unknown (null) is the honest "cannot tell".
      if (row.recordedTitle !== null) {
        expect([row.file, row.recordedTitle]).toEqual([row.file, row.title]);
      }
      if (row.recordedCount !== null) {
        expect([row.file, row.recordedCount]).toEqual([row.file, row.count]);
      }
    });
    const unknownCounts = table.filter((r) => r.recordedCount === null).map((r) => r.file);
    const unknownTitles = table.filter((r) => r.recordedTitle === null).map((r) => r.file);
    expect(unknownCounts).toEqual(['src/star/Star.stories.tsx']);
    expect(unknownTitles).toEqual([
      'src/computed/Computed.stories.tsx',
      'src/nodefault/NoDefault.stories.tsx',
    ]);
  });
});
