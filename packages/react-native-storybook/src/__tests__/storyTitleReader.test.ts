'use strict';

const { readDeclaredTitle, readStoryCount } = require('../../metro/storyTitleReader');

describe('storyTitleReader', () => {
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
