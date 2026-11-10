/**
 * The step before an iOS build starts (../iosBuildPick), over a fake app builder seam.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { type AppBuilder, installAppBuilder } from '../../../../seams/appBuilder';
import { pickIosBuild } from '../iosBuildPick';

let uninstallBuilder: () => void = () => undefined;

afterEach(() => {
  uninstallBuilder();
  uninstallBuilder = () => undefined;
});

function builderWith(schemes: string[], configurations: string[] | null) {
  uninstallBuilder = installAppBuilder({
    listIosSchemes: async () => schemes,
    readIosAppTarget: async () =>
      configurations
        ? { appSchemes: schemes, configurations, archiveConfiguration: configurations.at(-1)! }
        : null,
  } as unknown as AppBuilder);
}

describe('the iOS scheme and configuration a build uses', () => {
  it('picks the only scheme and the configuration the scheme archives with', async () => {
    builderWith(['Storefront'], ['Debug', 'Release']);

    const pick = await pickIosBuild('/project', {}, undefined);

    expect(pick.scheme).toBe('Storefront');
    expect(pick.configuration?.name).toBe('Release');
  });

  it('has no configuration when the app target could not be read', async () => {
    builderWith(['Storefront'], null);

    expect(await pickIosBuild('/project', {}, undefined)).toEqual({
      scheme: 'Storefront',
      passedOverSchemes: [],
      configuration: null,
    });
  });

  it('refuses a configuration the app lacks, naming the ones it has', async () => {
    builderWith(['Storefront'], ['Debug', 'Release']);

    await expect(
      pickIosBuild('/project', { ios: { configuration: 'Staging' } }, undefined)
    ).rejects.toThrow('It has Debug, Release.');
  });
});
