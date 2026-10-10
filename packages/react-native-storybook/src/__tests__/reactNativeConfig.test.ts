import { loadPlatformsWith } from './linkingConfig';

describe("the SDK's native linking", () => {
  it('links the native module for debug only when the setting is off or unset', () => {
    for (const value of [undefined, 'off']) {
      const { ios, android } = loadPlatformsWith(value);

      expect(ios.configurations).toEqual(['Debug']);
      expect(android.buildTypes).toEqual(['debug']);
    }
  });

  it('links the native module for every configuration when the setting is storybook or app-and-storybook', () => {
    for (const value of ['storybook', 'app-and-storybook']) {
      const { ios, android } = loadPlatformsWith(value);

      expect(ios.configurations).toBeUndefined();
      expect(android.buildTypes).toBeUndefined();
      expect(android.packageInstance).toBeUndefined();
    }
  });

  it('with the setting off or unset Android finds the package by name and falls back to an empty package', () => {
    for (const value of [undefined, 'off']) {
      const { android } = loadPlatformsWith(value);

      expect(android.packageInstance).toContain(
        'Class.forName("io.sherlo.storybookreactnative.SherloModulePackage")'
      );
      expect(android.packageInstance).toContain('catch (Exception sherloNotLinked)');
      expect(android.packageInstance).toContain('Collections.emptyList()');
    }
  });
});
