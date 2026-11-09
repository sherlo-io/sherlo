import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APPLICATION_PRODUCT_TYPE } from '../../../../react-native-storybook/metro/xcodeProject';
import {
  APP_EXTENSION_PRODUCT_TYPE,
  type FixtureTarget,
  pbxprojWith,
  UNIT_TEST_PRODUCT_TYPE,
} from '../../../../react-native-storybook/src/__tests__/xcodeProjectFixture';
import {
  iosBuildConfiguration,
  pickIosConfiguration,
  readIosAppTargetFromFiles,
} from '../iosConfiguration';
import { schemeXmlWith } from './xcodeSchemeFixture';

let iosFolder: string;

beforeEach(() => {
  iosFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-ios-config-'));
  fs.mkdirSync(path.join(iosFolder, 'App.xcodeproj'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(iosFolder, { recursive: true, force: true });
});

/** The project file: an application target named App with the configurations given, and the other targets after it. */
function writeProject(names: string[], otherTargets: FixtureTarget[] = []) {
  fs.writeFileSync(
    path.join(iosFolder, 'App.xcodeproj/project.pbxproj'),
    pbxprojWith([
      { name: 'App', productType: APPLICATION_PRODUCT_TYPE, configurations: names },
      ...otherTargets,
    ])
  );
}

/** A shared scheme (./xcodeSchemeFixture) in the project or the workspace named. */
function writeScheme(
  container: string,
  name: string,
  buildsTargets: number[],
  archiveConfiguration?: string
) {
  const schemes = path.join(iosFolder, container, 'xcshareddata/xcschemes');
  fs.mkdirSync(schemes, { recursive: true });
  fs.writeFileSync(
    path.join(schemes, `${name}.xcscheme`),
    schemeXmlWith(buildsTargets, archiveConfiguration)
  );
}

describe('the iOS build configuration chosen from the project files', () => {
  it('uses the configuration it is given before reading any file', () => {
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App', configuration: 'Staging' })).toBe(
      'Staging'
    );
  });

  it("picks the app target's Release matched case-insensitively and passes it spelled as the app spells it", () => {
    writeProject(['Debug', 'release']);
    writeScheme('App.xcodeproj', 'App', [0], 'Debug');
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('release');

    // A configuration named in the config is matched the same way and passed in the app's spelling;
    // one the app target lacks is no pick at all.
    const target = readIosAppTargetFromFiles(iosFolder, 'App');
    expect(target && pickIosConfiguration(target, 'RELEASE')).toEqual({
      name: 'release',
      from: 'config',
    });
    expect(target && pickIosConfiguration(target, 'Staging')).toBeNull();
  });

  it("reads the archive configuration from a scheme in the workspace's shared schemes", () => {
    writeProject(['dev.debug', 'dev.release']);
    writeScheme('App.xcworkspace', 'App', [0], 'dev.release');
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('dev.release');
  });

  it('falls back to Release when the project and the scheme say nothing', () => {
    writeProject(['dev.debug']);
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('Release');
  });

  it("reads the configurations of the application target only, never a test target's or an extension's", () => {
    writeProject(
      ['DEV.DEBUG', 'DEV.RELEASE'],
      [
        {
          name: 'AppTests',
          productType: UNIT_TEST_PRODUCT_TYPE,
          configurations: ['Debug', 'Release'],
        },
        { name: 'Widget', productType: APP_EXTENSION_PRODUCT_TYPE, configurations: ['Release'] },
      ]
    );
    // The app's scheme builds its test bundle and its widget beside it, as Xcode's schemes often do.
    writeScheme('App.xcodeproj', 'App', [1, 0, 2], 'DEV.RELEASE');
    writeScheme('App.xcodeproj', 'AppTests', [1], 'Release');
    writeScheme('App.xcodeproj', 'Widget', [2], 'Release');

    expect(readIosAppTargetFromFiles(iosFolder)).toEqual({
      appSchemes: ['App'],
      configurations: ['DEV.DEBUG', 'DEV.RELEASE'],
      archiveConfiguration: 'DEV.RELEASE',
    });
    // No Release on the app target: the test target's and the widget's never stand in for one.
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('DEV.RELEASE');
  });
});
