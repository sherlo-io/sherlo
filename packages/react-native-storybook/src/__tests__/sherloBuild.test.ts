const { readSherloBuild, whatThisBuildCarries } = require('../../metro/sherloBuild');

const RELEASE_BUILD = true;
const DEBUG_BUILD = false;

describe('the build setting says how much of Sherlo and Storybook a build carries', () => {
  it('SHERLO_BUILD unset is off in a release build and app-and-storybook in a debug build', () => {
    expect(readSherloBuild({})).toBeNull();
    expect(readSherloBuild({ SHERLO_BUILD: '' })).toBeNull();

    expect(whatThisBuildCarries({}, RELEASE_BUILD, undefined)).toEqual({
      sherloBuild: 'off',
      storybookEnabled: false,
    });
    expect(whatThisBuildCarries({ SHERLO_BUILD: '' }, RELEASE_BUILD, true)).toEqual({
      sherloBuild: 'off',
      storybookEnabled: false,
    });

    // Unset in a debug build, Storybook's own option still decides Storybook, as given.
    expect(whatThisBuildCarries({}, DEBUG_BUILD, undefined)).toEqual({
      sherloBuild: 'app-and-storybook',
      storybookEnabled: undefined,
    });
    expect(whatThisBuildCarries({}, DEBUG_BUILD, false)).toEqual({
      sherloBuild: 'app-and-storybook',
      storybookEnabled: false,
    });
  });

  it('an unknown SHERLO_BUILD value stops the bundler naming the three values', () => {
    const unknownValueMessage =
      'Unknown SHERLO_BUILD value "on". Use storybook, app-and-storybook or off, or leave it unset.';

    expect(() => readSherloBuild({ SHERLO_BUILD: 'on' })).toThrow(unknownValueMessage);
    expect(() => whatThisBuildCarries({ SHERLO_BUILD: 'on' }, DEBUG_BUILD, true)).toThrow(
      unknownValueMessage
    );
    // A value is read as written: no case folding, no trimming.
    expect(() => readSherloBuild({ SHERLO_BUILD: 'OFF' })).toThrow('"OFF"');
    expect(() => readSherloBuild({ SHERLO_BUILD: ' off' })).toThrow('" off"');

    expect(readSherloBuild({ SHERLO_BUILD: 'storybook' })).toBe('storybook');
    expect(readSherloBuild({ SHERLO_BUILD: 'app-and-storybook' })).toBe('app-and-storybook');
    expect(readSherloBuild({ SHERLO_BUILD: 'off' })).toBe('off');
  });

  it("a set SHERLO_BUILD wins over Storybook's enabled option and STORYBOOK_ENABLED", () => {
    // Set to off: Storybook stays out, whatever its own switches say, in any build.
    expect(
      whatThisBuildCarries({ SHERLO_BUILD: 'off', STORYBOOK_ENABLED: 'true' }, DEBUG_BUILD, true)
    ).toEqual({ sherloBuild: 'off', storybookEnabled: false });

    // Set to a value with Storybook in it: Storybook is on, even when its option says false,
    // and even in a release build.
    expect(whatThisBuildCarries({ SHERLO_BUILD: 'storybook' }, RELEASE_BUILD, false)).toEqual({
      sherloBuild: 'storybook',
      storybookEnabled: true,
    });
    expect(
      whatThisBuildCarries(
        { SHERLO_BUILD: 'app-and-storybook', STORYBOOK_ENABLED: 'false' },
        RELEASE_BUILD,
        false
      )
    ).toEqual({ sherloBuild: 'app-and-storybook', storybookEnabled: true });

    // Unset, STORYBOOK_ENABLED=true counts as storybook, over a release build and the option.
    expect(whatThisBuildCarries({ STORYBOOK_ENABLED: 'true' }, RELEASE_BUILD, false)).toEqual({
      sherloBuild: 'storybook',
      storybookEnabled: true,
    });
  });
});
