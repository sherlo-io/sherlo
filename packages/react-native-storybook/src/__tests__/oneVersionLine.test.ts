/**
 * ONE VERSION LINE - the repository versions every package in lockstep through lerna, and the
 * release workflows stamp the SDK's native files from lerna's version. If the SDK carries a
 * version of its own, the CLI reads a different number from the app than the SDK speaks.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(__dirname, '../../../..');
const sdkRoot = path.resolve(__dirname, '../..');

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('one version line', () => {
  const lernaVersion: string = readJson(path.join(repositoryRoot, 'lerna.json')).version;

  it("every package lerna versions carries lerna's version", () => {
    const packageFolders = fs
      .readdirSync(path.join(repositoryRoot, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const packageVersions: Record<string, string> = {};
    for (const folder of packageFolders) {
      const packageJsonPath = path.join(repositoryRoot, 'packages', folder, 'package.json');
      if (!fs.existsSync(packageJsonPath)) continue;
      packageVersions[`packages/${folder}`] = readJson(packageJsonPath).version;
    }

    expect(Object.keys(packageVersions).length).toBeGreaterThan(0);
    for (const [packageFolder, packageVersion] of Object.entries(packageVersions)) {
      expect(packageVersion, `${packageFolder} against lerna.json ${lernaVersion}`).toBe(
        lernaVersion
      );
    }
  });

  it("the SDK's JS module version and its native sherlo.json files equal lerna's version", () => {
    const sdkPackageVersion: string = readJson(path.join(sdkRoot, 'package.json')).version;
    const jsModuleVersion: string = readJson(
      path.join(sdkRoot, 'src/sdk-compatibility.json')
    ).JS_MODULE_VERSION;
    const androidSherloJsonVersion: string = readJson(
      path.join(sdkRoot, 'android/src/main/assets/sherlo.json')
    ).version;
    const iosSherloJsonVersion: string = readJson(
      path.join(sdkRoot, 'ios/Resources/assets/sherlo.json')
    ).version;

    expect(sdkPackageVersion, 'SDK package.json').toBe(lernaVersion);
    expect(jsModuleVersion, 'sdk-compatibility.json JS_MODULE_VERSION').toBe(lernaVersion);
    expect(androidSherloJsonVersion, 'android sherlo.json').toBe(lernaVersion);
    expect(iosSherloJsonVersion, 'ios sherlo.json').toBe(lernaVersion);
  });
});
