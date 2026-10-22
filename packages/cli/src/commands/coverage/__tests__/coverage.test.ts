/**
 * THE COVERAGE COMMAND - the component list is proven over a small shop app held in memory, and
 * `--props` over a small typed app held in memory, its types read by the repo's own TypeScript
 * through the seam's TypeScript 7 reader (one tsgo process for the whole file).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as classicTypeScript from 'typescript-5';
import * as nativeTypeScript from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import stripAnsi from '../../../helpers/stripAnsi';
import { renderCoverage } from '../../../render/coverage';
import type { CoverageProps } from '../../../render/coverage';
import { classicComponentTypes, nativeComponentTypes } from '../../../seams/coverageScan';
import type { OpenComponentTypes } from '../../../seams/coverageScan';
import { componentGaps } from '../componentGaps';
import type { SourceFile } from '../componentGaps';
import { storyPropValues } from '../storyPropValues';

const component = (name: string) => `export function ${name}() {\n  return <View />;\n}\n`;

/** A shop: a barrel, a wrapped component, a hook, an excluded story and screens with many imports. */
const SHOP: SourceFile[] = [
  { path: 'src/components/base/Button.tsx', text: component('Button') },
  { path: 'src/components/base/Badge.tsx', text: component('Badge') },
  {
    path: 'src/components/base/Price.tsx',
    text: "import { memo } from 'react';\nexport const Price = memo(() => <Text />);\n",
  },
  {
    path: 'src/components/base/Search.tsx',
    text: 'export default function Search() { return <View />; }',
  },
  { path: 'src/components/base/Cart.tsx', text: component('Cart') },
  {
    path: 'src/components/base/index.ts',
    text: "export * from './Button';\nexport { default as Search } from './Search';\n",
  },
  { path: 'src/hooks/useCart.ts', text: 'export function useCart() { return 1; }' },
  { path: 'src/utils/format.ts', text: 'export const format = () => <b />;' },
  {
    path: 'src/screens/Home.tsx',
    text: [
      "import { Button } from '@/components/base';",
      "import { Badge } from '../components/base/Badge';",
      "import { Price } from '../components/base/Price';",
      "import { Search } from '../components/base';",
      'export const Home = () => <View />;',
    ].join('\n'),
  },
  {
    path: 'src/screens/Details.tsx',
    text: "import { Badge } from '../components/base/Badge';\nimport { Price } from '../components/base/Price';\nexport const Details = () => <View />;",
  },
  {
    path: 'src/screens/Checkout.tsx',
    text: "import { Price } from '../components/base/Price';\nexport const Checkout = () => <View />;",
  },
  {
    path: 'src/components/base/Button.stories.tsx',
    text: "import { Button } from './Button';\nexport default { component: Button };\nexport const Basic = {};",
  },
  {
    path: 'src/components/base/Search.stories.tsx',
    text: [
      "import { Search } from './index';",
      'const meta = { component: Search, parameters: { sherlo: { exclude: true } } };',
      'export default meta;',
      'export const Basic = {};',
    ].join('\n'),
  },
  {
    path: 'src/screens/Home.stories.tsx',
    text: "import { Home } from './Home';\nexport default { component: Home };\nexport const Basic = {};",
  },
];

const TSCONFIG = `{
  // the shop's own tsconfig
  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, },
}`;

describe('sherlo coverage lists what no story covers', () => {
  it('lists a component no story file imports, ranked by importing files', () => {
    const { components, gaps } = componentGaps({ files: SHOP, tsconfig: TSCONFIG });

    // Hooks and utils are not components; a screen story's own imports are never followed.
    expect(components).toBe(8);
    expect(gaps).toEqual([
      { name: 'Price', file: 'src/components/base/Price.tsx', importedBy: 3 },
      { name: 'Badge', file: 'src/components/base/Badge.tsx', importedBy: 2 },
      { name: 'Search', file: 'src/components/base/Search.tsx', importedBy: 1, excluded: true },
      { name: 'Cart', file: 'src/components/base/Cart.tsx', importedBy: 0 },
      { name: 'Checkout', file: 'src/screens/Checkout.tsx', importedBy: 0 },
      { name: 'Details', file: 'src/screens/Details.tsx', importedBy: 0 },
    ]);
  });

  it('passes barrel re-exports when deciding a story imports a component', () => {
    const { gaps } = componentGaps({ files: SHOP, tsconfig: TSCONFIG });
    const names = gaps.map((gap) => gap.name);

    // Button.stories imports Button directly and Home.stories imports Home; neither is a gap.
    expect(names).not.toContain('Button');
    expect(names).not.toContain('Home');

    // A story that imports Cart through a barrel counts as importing Cart itself.
    const throughBarrel = componentGaps({
      files: [
        ...SHOP,
        {
          path: 'src/components/base/Cart.stories.tsx',
          text: "import { Cart } from '@/components/base/cart-barrel';\nexport default { component: Cart };\nexport const Basic = {};",
        },
        {
          path: 'src/components/base/cart-barrel/index.ts',
          text: "export { Cart } from '../Cart';",
        },
      ],
      tsconfig: TSCONFIG,
    }).gaps.map((gap) => gap.name);
    expect(throughBarrel).not.toContain('Cart');
    expect(throughBarrel).toContain('Price');
  });

  it('marks a gap only an excluded story imports', () => {
    const { gaps } = componentGaps({ files: SHOP, tsconfig: TSCONFIG });

    expect(gaps.filter((gap) => gap.excluded).map((gap) => gap.name)).toEqual(['Search']);

    // Every story in a file carrying the flag excludes the file, with no flag on its meta.
    const everyStory = componentGaps({
      files: [
        { path: 'Tag.tsx', text: component('Tag') },
        {
          path: 'Tag.stories.tsx',
          text: [
            "import { Tag } from './Tag';",
            'export default { component: Tag };',
            'export const A = { parameters: { sherlo: { exclude: true } } };',
            'export const B = { parameters: { sherlo: { exclude: true } } };',
          ].join('\n'),
        },
      ],
    }).gaps;
    expect(everyStory).toEqual([{ name: 'Tag', file: 'Tag.tsx', importedBy: 0, excluded: true }]);
  });
});

/** A small app with typed props, read by the repo's own TypeScript standing in for the app's. */
const ROOT = '/app';
const COLORS = Array.from({ length: 12 }, (_, index) => `'c${index}'`).join(' | ');
const TYPED_APP: SourceFile[] = [
  {
    path: 'node_modules/react-native/index.d.ts',
    text: 'export type ViewProps = { testID?: string; accessible?: boolean };',
  },
  {
    path: 'src/Avatar.tsx',
    text: [
      "import type { ViewProps } from 'react-native';",
      "type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';",
      'export type AvatarProps = ViewProps & { size?: Size; isRound?: boolean; label: string };',
      'export function Avatar(props: AvatarProps) { return null; }',
    ].join('\n'),
  },
  { path: 'src/index.ts', text: "export * from './Avatar';" },
  {
    path: 'src/Badge.tsx',
    text: "export const Badge = (props: { tone: 'info' | 'warn' | 'error'; isDot?: boolean }) => null;",
  },
  {
    path: 'src/helpers.tsx',
    text: 'import { Badge } from \'./Badge\';\nexport const WarnBadge = () => <Badge tone="warn" />;',
  },
  {
    path: 'src/Text.tsx',
    text: `export default function Text(props: { color?: ${COLORS}; weight?: 'light' | 'regular' | 'medium' | 'bold' }) { return null; }`,
  },
  { path: 'src/Tag.tsx', text: "export function Tag(props: { kind: 'a' | 'b' }) { return null; }" },
  {
    path: 'src/Avatar.stories.tsx',
    text: [
      "import { Avatar } from './index';",
      'const base = { size: "xl" };',
      'const size = "xs";',
      "const meta = { component: Avatar, args: { size: 'md' } } as const;",
      'export default meta;',
      "export const Large = { args: { size: 'lg', isRound: true, testID: 'avatar' } };",
      'export const Spread = { args: { ...base, size } };',
    ].join('\n'),
  },
  {
    path: 'src/Badge.stories.tsx',
    text: [
      "import { Badge } from './Badge';",
      "import { WarnBadge } from './helpers';",
      'export default { component: Badge };',
      'function Row() { return <Badge tone="info" isDot />; }',
      "export const Basic = { render: () => <><Row /><Badge tone={'error'} /><WarnBadge /></> };",
      'export const Hidden = {',
      '  parameters: { sherlo: { exclude: true } },',
      '  args: { isDot: false },',
      '  render: () => <Badge tone="warn" />,',
      '};',
    ].join('\n'),
  },
  {
    path: 'src/TextHidden.stories.tsx',
    text: [
      "import Text from './Text';",
      "export default { component: Text, args: { weight: 'bold' }, parameters: { sherlo: { exclude: true } } };",
      'export const Bold = {};',
    ].join('\n'),
  },
  {
    path: 'src/Text.stories.tsx',
    text: [
      '// Napisy - zażółć gęślą jaźń: text before the meta that is not ASCII.',
      "import Text from './Text';",
      "export default { component: Text, args: { weight: 'light', color: 'c0' } };",
      "export const Regular = { args: { weight: 'regular' } };",
      "export const Medium = { args: { weight: 'medium', color: 'c3' } };",
    ].join('\n'),
  },
  {
    path: 'src/Tag.stories.tsx',
    text: "import { Tag } from './Tag';\nexport default { component: Tag, args: { kind: 'a' } };\nexport const B = { args: { kind: 'b' } };",
  },
  {
    path: 'src/Made.stories.tsx',
    text: "import { Tag } from './Tag';\nimport { makeMeta } from './meta';\nexport default makeMeta(Tag);",
  },
];

describe('sherlo coverage --props lists the prop values no story file sets', () => {
  let types: OpenComponentTypes;
  let found: CoverageProps;
  const propsOf = (name: string) => found.components.find((entry) => entry.name === name)?.props;

  beforeAll(() => {
    const files = Object.fromEntries(
      [
        {
          path: 'tsconfig.json',
          text: '{ "compilerOptions": { "jsx": "preserve", "strict": true } }',
        },
        ...TYPED_APP,
      ].map((file) => [`${ROOT}/${file.path}`, file.text])
    );
    types = nativeComponentTypes(nativeTypeScript, {
      root: ROOT,
      fs: createVirtualFileSystem(files),
    });
    found = storyPropValues({ files: TYPED_APP, types });
  });

  afterAll(() => types?.close());

  it("counts a prop value a story's args set", () => {
    // The meta's `md` and a story's `lg` and `true` count; a spread and a variable are not read,
    // and props inherited from node_modules (`testID`) or of an open type (`label`) are left out.
    // Missing values keep the order the `Size` alias declares them in, never the checker's.
    expect(found.storyFiles).toBe(6);
    expect(found.components.find((entry) => entry.name === 'Avatar')).toEqual({
      name: 'Avatar',
      file: 'src/Avatar.tsx',
      props: [
        { prop: 'size', allowed: 6, set: 2, missing: ['"xs"', '"sm"', '"xl"', '"xxl"'] },
        { prop: 'isRound', allowed: 2, set: 1, missing: ['false'] },
      ],
    });
  });

  it('counts a prop value written on the component inside its story file', () => {
    // `tone="info"` and `isDot` in a render function of the file, and `tone={'error'}` in a story.
    expect(propsOf('Badge')).toEqual([
      { prop: 'tone', allowed: 3, set: 2, missing: ['"warn"'] },
      { prop: 'isDot', allowed: 2, set: 1, missing: ['false'] },
    ]);
  });

  it('does not follow a helper defined in another file', () => {
    // WarnBadge, from helpers.tsx, sets `tone="warn"`: the story file draws it, and it still counts
    // as not set.
    expect(propsOf('Badge')?.find((finding) => finding.prop === 'tone')?.missing).toEqual([
      '"warn"',
    ]);
  });

  it('does not count a value that only an excluded story sets', () => {
    // Badge's excluded `Hidden` story sets `isDot: false` and draws `tone="warn"`, and the excluded
    // TextHidden file sets `weight: 'bold'`: none of them counts as set.
    expect(propsOf('Badge')).toEqual([
      { prop: 'tone', allowed: 3, set: 2, missing: ['"warn"'] },
      { prop: 'isDot', allowed: 2, set: 1, missing: ['false'] },
    ]);
    expect(propsOf('Text')?.find((finding) => finding.prop === 'weight')?.missing).toEqual([
      '"bold"',
    ]);
  });

  it('lists missing values of a prop with at most 10 values', () => {
    expect(propsOf('Text')?.find((finding) => finding.prop === 'weight')).toEqual({
      prop: 'weight',
      allowed: 4,
      set: 3,
      missing: ['"bold"'],
    });
    // Every value of Tag's `kind` is set, so Tag is not listed; a file whose default export is
    // not an object literal is read for nothing.
    expect(found.components.map((entry) => entry.name)).toEqual(['Avatar', 'Badge', 'Text']);
  });

  it('shows a count line for a prop with more than 10 values', () => {
    expect(propsOf('Text')?.find((finding) => finding.prop === 'color')).toEqual({
      prop: 'color',
      allowed: 12,
      set: 2,
    });

    const lines = renderCoverage({ findings: { components: 0, gaps: [], props: found } }).map(
      stripAnsi
    );
    expect(lines).toContain('    color   2 of 12 set');
    expect(lines).toContain('    weight  3 of 4 set   missing "bold"');
  });

  it('reads prop values with a TypeScript older than 7', () => {
    // The same app, written to a folder because the classic compiler reads a disk, read through
    // TypeScript 5: it names the same missing values in the same declared order, though this
    // tsconfig.json leaves the story files out of its program (as many apps' do).
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-coverage-'));
    const classic = [
      {
        path: 'tsconfig.json',
        text: '{ "compilerOptions": { "jsx": "preserve", "strict": true, "lib": ["es5"] }, "exclude": ["**/*.stories.tsx"] }',
      },
      ...TYPED_APP,
    ];
    for (const file of classic) {
      fs.mkdirSync(path.dirname(path.join(folder, file.path)), { recursive: true });
      fs.writeFileSync(path.join(folder, file.path), file.text);
    }
    try {
      const older = classicComponentTypes(
        classicTypeScript as unknown as Parameters<typeof classicComponentTypes>[0],
        { root: fs.realpathSync(folder) }
      );
      expect(found.components.length).toBeGreaterThan(0);
      expect(storyPropValues({ files: TYPED_APP, types: older })).toEqual(found);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
