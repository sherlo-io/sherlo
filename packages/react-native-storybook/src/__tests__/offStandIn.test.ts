import * as fs from 'fs';
import * as path from 'path';

import * as theSdk from '../index';
import * as standIn from '../offStandIn';
// @ts-ignore - test-only helpers on the react-native stub
import { __getAlerts, __resetAlerts, NativeModules } from 'react-native';

describe("the SDK's stand-in in a build without Sherlo", () => {
  beforeEach(() => {
    __resetAlerts();
  });

  it('in the stand-in openStorybook shows a message naming SHERLO_BUILD', () => {
    const openStorybookOnTheNativeModule = vi.spyOn(NativeModules.SherloModule, 'openStorybook');

    standIn.openStorybook();

    expect(__getAlerts()).toEqual([
      [
        'Storybook is not in this build',
        'This build was made without Storybook. To include it in a release build, set SHERLO_BUILD to app-and-storybook.',
      ],
    ]);
    expect(openStorybookOnTheNativeModule).not.toHaveBeenCalled();
    openStorybookOnTheNativeModule.mockRestore();
  });

  it('exports every name the SDK exports, with both modes false', () => {
    expect(Object.keys(standIn).sort()).toEqual(Object.keys(theSdk).sort());
    expect(standIn.isStorybookMode).toBe(false);
    expect(standIn.isRunningVisualTests).toBe(false);
  });

  it('declarations return what a declaration returns, and do nothing', async () => {
    const importModule = vi.fn(() => Promise.resolve({ whoAmI: () => 'real' }));
    const moduleMock = standIn.mock(importModule, { whoAmI: () => 'mocked' });
    expect(moduleMock.kind).toBe('module');
    await expect(moduleMock.moduleKey()).resolves.toBeUndefined();
    expect(importModule).not.toHaveBeenCalled();

    expect(standIn.mockRequest({ url: 'https://example.com' }, { body: [] }).kind).toBe('network');
    expect(standIn.mockRequest.passthrough().kind).toBe('network');
    expect(standIn.mockClock('2020-01-02T03:04:05.000Z').kind).toBe('module');
    expect(standIn.mockRandom(42).kind).toBe('module');

    const refusal = new standIn.UnmockedRequestError('no rule');
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.name).toBe('UnmockedRequestError');
    expect(refusal.message).toBe('no rule');
  });

  it("imports nothing of Sherlo's native module and nothing of Storybook", () => {
    const source = fs.readFileSync(path.join(__dirname, '../offStandIn.ts'), 'utf8');
    const importedModules = [...source.matchAll(/^import(?!\s+type)[^;]*?from\s+'([^']+)'/gm)].map(
      (match) => match[1]
    );
    expect(importedModules).toEqual(['react-native']);
  });
});
