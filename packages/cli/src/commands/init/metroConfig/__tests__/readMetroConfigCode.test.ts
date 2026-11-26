import { describe, expect, it } from 'vitest';
import readMetroConfigCode from '../readMetroConfigCode';

describe('readMetroConfigCode', () => {
  it("reads Sherlo's withStorybook, required or imported, as wired", () => {
    expect(
      readMetroConfigCode(
        "const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');\nmodule.exports = withStorybook(config);"
      )?.wiredForSherlo
    ).toBe(true);
    expect(
      readMetroConfigCode(
        "import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook';\nexport default withStorybook(config);"
      )?.wiredForSherlo
    ).toBe(true);
  });

  it("reads Sherlo's older factory as wired", () => {
    expect(
      readMetroConfigCode('module.exports = sherlo.createSherloStorybook(config);')?.wiredForSherlo
    ).toBe(true);
  });

  it('a comment or a string naming withStorybook is not code that names it', () => {
    const code = readMetroConfigCode(
      "// wrap in withStorybook( later, from @sherlo/react-native-storybook/metro/withStorybook\nconst note = 'withStorybook(';\nmodule.exports = config;"
    );
    expect(code).toEqual({ wiredForSherlo: false, mentionsWithStorybook: false, configPath: null });
  });

  it('reads a configPath string against the project root', () => {
    expect(
      readMetroConfigCode("module.exports = withStorybook(config, { configPath: './.storybook' });")
        ?.configPath
    ).toEqual({ against: 'project-root', path: './.storybook' });
  });

  it("reads a configPath built from __dirname against the config's own folder", () => {
    expect(
      readMetroConfigCode(
        "module.exports = withStorybook(config, { configPath: path.join(__dirname, '..', '.rnstorybook') });"
      )?.configPath
    ).toEqual({ against: 'config-folder', path: '../.rnstorybook' });
  });

  it('a configPath built any other way is not read', () => {
    expect(
      readMetroConfigCode('module.exports = withStorybook(config, { configPath: folder });')
        ?.configPath
    ).toBeNull();
  });

  it('code that does not parse is null', () => {
    expect(readMetroConfigCode('module.exports = {')).toBeNull();
  });
});
