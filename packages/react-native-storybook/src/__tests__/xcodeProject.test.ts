import fs from 'fs';
import os from 'os';
import path from 'path';
import { pbxprojWith, targetIdOf, UNIT_TEST_PRODUCT_TYPE } from './xcodeProjectFixture';

const {
  APPLICATION_PRODUCT_TYPE,
  readNativeTargets,
  readXcodeProjects,
} = require('../../metro/xcodeProject');

describe("the reader of an app's Xcode project files (metro/xcodeProject.js)", () => {
  it('reads each native target with its product type and its own configurations, never a name inside buildSettings', () => {
    const pbxproj = pbxprojWith([
      {
        name: 'App',
        productType: APPLICATION_PRODUCT_TYPE,
        configurations: ['DEV.DEBUG', 'release'],
      },
      { name: 'AppTests', productType: UNIT_TEST_PRODUCT_TYPE, configurations: ['Debug'] },
    ]);

    expect(readNativeTargets(pbxproj)).toEqual([
      {
        id: targetIdOf(0),
        name: 'App',
        productType: APPLICATION_PRODUCT_TYPE,
        configurations: ['DEV.DEBUG', 'release'],
      },
      {
        id: targetIdOf(1),
        name: 'AppTests',
        productType: UNIT_TEST_PRODUCT_TYPE,
        configurations: ['Debug'],
      },
    ]);
  });

  it('reads every Xcode project in the iOS folder, and a project with no readable file declares no targets', () => {
    const iosFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-xcode-project-'));
    try {
      fs.mkdirSync(path.join(iosFolder, 'App.xcodeproj'));
      fs.writeFileSync(
        path.join(iosFolder, 'App.xcodeproj', 'project.pbxproj'),
        pbxprojWith([
          { name: 'App', productType: APPLICATION_PRODUCT_TYPE, configurations: ['Release'] },
        ])
      );
      fs.mkdirSync(path.join(iosFolder, 'Empty.xcodeproj'));

      expect(readXcodeProjects(iosFolder)).toEqual([
        {
          container: 'App.xcodeproj',
          targets: [expect.objectContaining({ name: 'App', configurations: ['Release'] })],
        },
        { container: 'Empty.xcodeproj', targets: [] },
      ]);
    } finally {
      fs.rmSync(iosFolder, { recursive: true, force: true });
    }
  });
});
