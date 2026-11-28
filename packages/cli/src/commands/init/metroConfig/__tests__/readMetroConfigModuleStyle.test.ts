import { describe, expect, it } from 'vitest';
import readMetroConfigModuleStyle from '../readMetroConfigModuleStyle';

describe('setup reads which module style a Metro config is written in', () => {
  it('reads require from a CommonJS config', () => {
    expect(
      readMetroConfigModuleStyle(
        "const { getDefaultConfig } = require('expo/metro-config');\n\nmodule.exports = async () => getDefaultConfig(__dirname);\n"
      )
    ).toBe('require');
  });

  it('reads import from an ES module config', () => {
    expect(
      readMetroConfigModuleStyle(
        "import { getDefaultConfig } from 'expo/metro-config';\n\nexport default async () => getDefaultConfig(__dirname);\n"
      )
    ).toBe('import');
  });

  it('cannot tell a config that uses both styles', () => {
    expect(
      readMetroConfigModuleStyle(
        "import { getDefaultConfig } from 'expo/metro-config';\n\nmodule.exports = async () => getDefaultConfig(__dirname);\n"
      )
    ).toBe('unknown');
  });

  it('cannot tell a config that uses neither', () => {
    expect(readMetroConfigModuleStyle('getDefaultConfig(__dirname);\n')).toBe('unknown');
  });

  it('does not read a style from a comment', () => {
    expect(
      readMetroConfigModuleStyle(
        "// import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook';\nmodule.exports = () => ({});\n"
      )
    ).toBe('require');
  });
});
