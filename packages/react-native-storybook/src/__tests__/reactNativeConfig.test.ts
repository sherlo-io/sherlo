import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadPlatformsWith } from './linkingConfig';

const temporaryFolders: string[] = [];

/** A new temporary folder, removed after the test. */
function makeTemporaryFolder(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-linking-'));
  temporaryFolders.push(folder);
  return folder;
}

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

/** Lays a small app (ios/Podfile and ios/App.xcodeproj/project.pbxproj) in a temporary folder. */
function layApp(podfile: string, xcodeConfigurationNames: string[]): string {
  const appFolder = makeTemporaryFolder();
  const iosFolder = path.join(appFolder, 'ios');
  fs.mkdirSync(path.join(iosFolder, 'App.xcodeproj'), { recursive: true });
  fs.writeFileSync(path.join(iosFolder, 'Podfile'), podfile);
  const entries = xcodeConfigurationNames
    .map((name) => `\t\tisa = XCBuildConfiguration;\n\t\tname = "${name}";`)
    .join('\n');
  fs.writeFileSync(
    path.join(iosFolder, 'App.xcodeproj', 'project.pbxproj'),
    `/* Begin XCBuildConfiguration section */\n${entries}\n/* End XCBuildConfiguration section */\n`
  );
  return appFolder;
}

describe("the SDK's native linking", () => {
  it('with the setting off or unset iOS links every configuration the Podfile maps to debug, and Debug when the Podfile does not map it to release', () => {
    const podfile = (projectLine: string) => `target 'App' do\nend\n${projectLine}\n`;
    const cases: Array<[string, string[], string[]]> = [
      [
        podfile(
          "project 'App', 'dev.debug' => :debug, \"prod.debug\" => :debug, 'dev.release' => :release"
        ),
        ['dev.debug', 'dev.release', 'prod.debug'],
        ['dev.debug', 'prod.debug'],
      ],
      [
        podfile("project 'App', 'Staging' => :debug"),
        ['Debug', 'Release', 'Staging'],
        ['Staging', 'Debug'],
      ],
      [podfile("project 'App', 'Debug' => :release"), ['Debug', 'Release'], []],
    ];

    for (const value of [undefined, 'off']) {
      for (const [podfileText, xcodeNames, expected] of cases) {
        const { ios } = loadPlatformsWith(value, layApp(podfileText, xcodeNames) + '/ios');

        expect(ios === null ? [] : ios.configurations).toEqual(expected);
      }
    }
  });

  it('with the setting off or unset Android links the native module for the debug build type only', () => {
    for (const value of [undefined, 'off']) {
      const { android } = loadPlatformsWith(value);

      expect(android.buildTypes).toEqual(['debug']);
    }
  });

  it('with the setting off or unset and no Podfile found iOS answers Debug', () => {
    const noPodfileFolder = makeTemporaryFolder();
    // Whatever sits above the temporary folder on this machine, no Podfile exists for the lookup.
    const existsSync = fs.existsSync;
    const existsSyncSpy = vi
      .spyOn(fs, 'existsSync')
      .mockImplementation((file) => !String(file).endsWith('Podfile') && existsSync(file));

    try {
      for (const value of [undefined, 'off']) {
        expect(loadPlatformsWith(value, noPodfileFolder).ios).toEqual({
          configurations: ['Debug'],
        });
      }
    } finally {
      existsSyncSpy.mockRestore();
    }
  });

  it('with the setting off or unset and no debug configuration iOS does not link the module', () => {
    const appFolder = layApp("project 'App', 'Debug' => :release\n", ['Debug', 'Release']);

    for (const value of [undefined, 'off']) {
      expect(loadPlatformsWith(value, appFolder).ios).toBeNull();
    }
  });

  it('links the native module for every configuration when the setting is storybook or app-and-storybook', () => {
    for (const value of ['storybook', 'app-and-storybook']) {
      const { ios, android } = loadPlatformsWith(value);

      expect(ios).toEqual({});
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
