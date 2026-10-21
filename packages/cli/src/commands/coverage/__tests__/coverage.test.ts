/**
 * THE COVERAGE COMMAND - the component list is proven over a small shop app held in memory; the
 * `--props` cases are named and empty until scov-prop-values writes them.
 */
import { describe, expect, it } from 'vitest';
import { componentGaps } from '../componentGaps';
import type { SourceFile } from '../componentGaps';

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

  it.todo("counts a prop value a story's args set");
  it.todo('counts a prop value written on the component inside its story file');
  it.todo('does not follow a helper defined in another file');
  it.todo('lists missing values of a prop with at most 10 values');
  it.todo('shows a count line for a prop with more than 10 values');
});
