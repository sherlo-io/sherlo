/**
 * Android's C++ linking with SHERLO_BUILD off or unset.
 *
 * React Native's C++ autolinking writes one file for every build type, and it adds the folder the
 * SDK's config names (cmakeListsPath) to every one of them. Left to itself, that folder is the
 * glue the SDK's codegen writes into its build folder, which only a build that links Sherlo makes.
 * So the SDK names a folder it ships instead (android/cpp-autolinking), whose chooseGlue.cmake
 * gives the debug build the generated glue and every other build an empty stand-in under the same
 * names. The choice is run here for real, with cmake's script mode.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPlatformsWith } from './linkingConfig';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const ANDROID_DIR = path.join(SDK_ROOT, 'android');
const sdkPackage = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'package.json'), 'utf8'));
// React Native names everything it links for the module after the codegen's library name.
const LIBRARY_NAME: string = sdkPackage.codegenConfig.name;

/** The folder of C++ linking the SDK hands autolinking with the setting off or unset. */
function sharedCppFolder(): string {
  const { android } = loadPlatformsWith(undefined);
  return path.dirname(path.join(ANDROID_DIR, android.cmakeListsPath!));
}

const isCmakeInstalled = spawnSync('cmake', ['--version']).status === 0;

/** A folder standing in for the codegen's output: with its CMakeLists.txt, or empty. */
function generatedGlueFolder({ written }: { written: boolean }): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-glue-'));
  if (written) fs.writeFileSync(path.join(folder, 'CMakeLists.txt'), '# generated glue\n');
  return folder;
}

/** Runs chooseGlue.cmake alone, as a build of `buildType` would, and answers what it chose. */
function chooseGlue(buildType: string, glueFolder: string) {
  const run = spawnSync(
    'cmake',
    [
      '-DCMAKE_BUILD_TYPE=' + buildType,
      '-DGENERATED_GLUE_DIR=' + glueFolder,
      '-P',
      path.join(sharedCppFolder(), 'chooseGlue.cmake'),
    ],
    { encoding: 'utf8' }
  );
  const output = run.stdout + run.stderr;
  return {
    succeeded: run.status === 0,
    glue: output.match(/SHERLO_GLUE=(\S+)/)?.[1],
    output,
  };
}

describe("the SDK's shared C++ linking on Android", () => {
  it('a release build without the setting leaves Sherlo out of the shared C++ linking', () => {
    for (const value of [undefined, 'off']) {
      const { android } = loadPlatformsWith(value);

      // Autolinking reads cmakeListsPath from the package's android folder. It names a folder the
      // package ships, never the build folder the codegen writes, which a release build lacks.
      expect(android.cmakeListsPath).toBeDefined();
      const cmakeListsFile = path.join(ANDROID_DIR, android.cmakeListsPath!);
      expect(path.relative(ANDROID_DIR, cmakeListsFile).startsWith('build')).toBe(false);
      expect(fs.existsSync(cmakeListsFile)).toBe(true);
      const sharedFolder = path.relative(SDK_ROOT, path.dirname(cmakeListsFile));
      expect(sdkPackage.files).toContain(sharedFolder + '/**/*');

      // It adds the glue chooseGlue.cmake picks, and builds the stand-in under the names React
      // Native's generated file calls.
      const cmakeLists = fs.readFileSync(cmakeListsFile, 'utf8');
      expect(cmakeLists).toContain('include("${CMAKE_CURRENT_LIST_DIR}/chooseGlue.cmake")');
      expect(cmakeLists).toContain('if(SHERLO_GLUE STREQUAL "generated")');
      expect(cmakeLists).toContain('add_library(react_codegen_' + LIBRARY_NAME + ' OBJECT');
      const standInHeader = fs.readFileSync(
        path.join(path.dirname(cmakeListsFile), 'stand-in', LIBRARY_NAME + '.h'),
        'utf8'
      );
      expect(standInHeader).toContain(
        'std::shared_ptr<TurboModule> ' +
          LIBRARY_NAME +
          '_ModuleProvider(const std::string &moduleName, const JavaTurboModule::InitParams &params);'
      );
      const standInSource = fs.readFileSync(
        path.join(path.dirname(cmakeListsFile), 'stand-in', LIBRARY_NAME + '.cpp'),
        'utf8'
      );
      expect(standInSource).toContain('return nullptr;');
    }
  });

  it('the build type alone chooses the glue: a release build takes the stand-in, even where a debug build left the generated glue', (context) => {
    if (!isCmakeInstalled) {
      // GitHub's runners carry cmake, so the pull request check always runs this.
      if (process.env.CI === 'true') throw new Error('cmake is not installed on this runner');
      console.warn('cmake is not installed, so the choice of C++ glue is not run');
      context.skip();
    }
    const leftByADebugBuild = generatedGlueFolder({ written: true });
    const neverWritten = generatedGlueFolder({ written: false });
    try {
      expect(chooseGlue('Debug', leftByADebugBuild)).toMatchObject({
        succeeded: true,
        glue: 'generated',
      });
      for (const releaseType of ['RelWithDebInfo', 'Release']) {
        expect(chooseGlue(releaseType, leftByADebugBuild).glue).toBe('stand-in');
        expect(chooseGlue(releaseType, neverWritten).glue).toBe('stand-in');
      }

      // A debug build without the generated glue stops, naming the file it lacks.
      const debugWithoutGlue = chooseGlue('Debug', neverWritten);
      expect(debugWithoutGlue.succeeded).toBe(false);
      expect(debugWithoutGlue.output).toContain(path.join(neverWritten, 'CMakeLists.txt'));
    } finally {
      fs.rmSync(leftByADebugBuild, { recursive: true, force: true });
      fs.rmSync(neverWritten, { recursive: true, force: true });
    }
  });

  it("a build with the setting on keeps React Native's own C++ linking", () => {
    for (const value of ['storybook', 'app-and-storybook']) {
      const { android } = loadPlatformsWith(value);

      expect(android.cmakeListsPath).toBeUndefined();
    }
  });
});
