'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readDeclaredTitle,
  readStoryCount,
  readStoryFilePaths,
  readTitlesByImportPath,
} = require('../../metro/storyTitleReader');

describe('the record of each story file title by its import path', () => {
  it('a story file with its own title and one titled by its path both get their title under the app import path', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-titles-'));
    fs.mkdirSync(path.join(project, 'src', 'shop'), { recursive: true });
    fs.mkdirSync(path.join(project, '.rnstorybook'));
    fs.writeFileSync(
      path.join(project, 'src', 'shop', 'Cart.stories.tsx'),
      "export default { title: 'Shop/Checkout' };\nexport const One = {};\n"
    );
    fs.writeFileSync(
      path.join(project, 'src', 'Button.stories.tsx'),
      'export default {};\nexport const One = {};\n'
    );
    const requires = path.join(project, '.rnstorybook', 'storybook.requires.ts');
    fs.writeFileSync(
      requires,
      "const entries = [{ titlePrefix: '', directory: './src', req: require.context('../src', true, /\\.stories\\.tsx$/) }];\n"
    );

    expect(readTitlesByImportPath(requires)).toEqual({
      './src/shop/Cart.stories.tsx': 'Shop/Checkout',
      './src/Button.stories.tsx': 'Button',
    });
  });

  it('the list of story files names every file the loader gathers, even one whose title cannot be read', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-files-'));
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.mkdirSync(path.join(project, '.rnstorybook'));
    const story = path.join(project, 'src', 'Computed.stories.tsx');
    fs.writeFileSync(story, 'export default { title: compute() };\nexport const One = {};\n');
    const requires = path.join(project, '.rnstorybook', 'storybook.requires.ts');
    fs.writeFileSync(
      requires,
      "const entries = [{ titlePrefix: '', directory: './src', req: require.context('../src', true, /\\.stories\\.tsx$/) }];\n"
    );

    expect(readStoryFilePaths(requires)).toEqual([story]);
  });
});

describe('reading a story file title and count', () => {
  it('a story file whose decorator has a typed arrow still gives its title and count', () => {
    const source = [
      "import React from 'react';",
      "import { View } from 'react-native';",
      "import { CheckoutScreen } from './CheckoutScreen';",
      '',
      'export default {',
      "  title: 'Storefront/CheckoutScreen',",
      '  component: CheckoutScreen,',
      '};',
      '',
      'export const Basic = {',
      '  decorators: [',
      '    (Story: () => React.ReactNode) =>',
      "      React.createElement(View, { style: { backgroundColor: '#bae6fd', padding: 12 } }, React.createElement(Story)),",
      '  ],',
      '};',
    ].join('\n');

    expect(readDeclaredTitle(source)).toEqual({
      isKnown: true,
      declaredTitle: 'Storefront/CheckoutScreen',
    });
    expect(readStoryCount(source)).toBe(1);
  });
});
