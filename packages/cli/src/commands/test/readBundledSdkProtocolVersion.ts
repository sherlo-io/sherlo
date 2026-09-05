/**
 * Fail-soft reader for the SDK protocol version a bundled build requires.
 *
 * Unlike init's getPackageVersion (which enforces that the located
 * package.json's `name` matches the specifier and throws otherwise), this
 * reader has no such guard: an npm-aliased install
 * (`@sherlo/react-native-storybook@npm:@sherlo-io/react-native-storybook@x`)
 * resolves to a package.json whose `name` differs from the specifier, but
 * whose `version` is still the real protocol-version requirement. The
 * returned value is the BASE semver (major.minor.patch) of that resolved
 * version - any prerelease/build-metadata suffix (e.g. the `-test.<run-id>`
 * or `-dev.<n>` tag a CI-republished build carries) is stripped, since it
 * marks how the build was produced, not which protocol it implements. Any
 * failure - missing package, unreadable/invalid package.json, missing
 * version field, unparseable version - degrades to `undefined`; this reader
 * never throws.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../constants';

/**
 * Matches a leading major.minor.patch triplet followed by a prerelease
 * (`-...`), build-metadata (`+...`), or end-of-string boundary - so
 * `2.0.1abc` is rejected rather than truncated to `2.0.1`.
 */
const BASE_SEMVER_PATTERN = /^(\d+\.\d+\.\d+)(?:[-+]|$)/;

function toBaseSemver(version: string): string | undefined {
  return BASE_SEMVER_PATTERN.exec(version)?.[1];
}

export function readBundledSdkProtocolVersion(projectRoot: string): string | undefined {
  try {
    const packagePath = require.resolve(SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME, {
      paths: [projectRoot],
    });

    let currentDir = dirname(packagePath);
    let packageJsonPath: string | undefined;
    for (;;) {
      const candidate = join(currentDir, 'package.json');
      if (existsSync(candidate)) {
        packageJsonPath = candidate;
        break;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    if (!packageJsonPath) {
      return undefined;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return typeof packageJson.version === 'string' ? toBaseSemver(packageJson.version) : undefined;
  } catch {
    return undefined;
  }
}

export default readBundledSdkProtocolVersion;
