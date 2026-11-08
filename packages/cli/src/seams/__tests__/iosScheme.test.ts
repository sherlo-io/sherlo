import { describe, expect, it } from 'vitest';
import { pickIosScheme } from '../iosScheme';

describe('the scheme an iOS build uses', () => {
  it('picks the only scheme that builds an application and says which others it skipped', () => {
    expect(
      pickIosScheme({
        named: undefined,
        schemes: ['Storefront', 'StorefrontTests', 'StorefrontWidget'],
        appSchemes: ['Storefront'],
      })
    ).toEqual({ scheme: 'Storefront', skippedSchemes: ['StorefrontTests', 'StorefrontWidget'] });

    // The config's scheme and a workspace's only scheme skip nothing.
    expect(
      pickIosScheme({ named: 'StorefrontTests', schemes: [], appSchemes: ['Storefront'] })
    ).toEqual({ scheme: 'StorefrontTests', skippedSchemes: [] });
    expect(pickIosScheme({ named: undefined, schemes: ['Storefront'], appSchemes: [] })).toEqual({
      scheme: 'Storefront',
      skippedSchemes: [],
    });

    // Two app schemes, or none, are no pick: the build refuses, listing them.
    expect(
      pickIosScheme({
        named: undefined,
        schemes: ['Storefront', 'StorefrontStaging'],
        appSchemes: ['Storefront', 'StorefrontStaging'],
      })
    ).toBeNull();
    expect(
      pickIosScheme({
        named: undefined,
        schemes: ['Storefront', 'StorefrontStaging'],
        appSchemes: [],
      })
    ).toBeNull();
  });
});
