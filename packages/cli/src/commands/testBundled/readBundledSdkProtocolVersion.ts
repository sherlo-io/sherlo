/**
 * Fail-soft reader for the SDK protocol version a bundled build requires.
 *
 * Unlike init's getPackageVersion (which enforces that the located
 * package.json's `name` matches the specifier and throws otherwise), this
 * reader has no such guard: an npm-aliased install
 * (`@sherlo/react-native-storybook@npm:@sherlo-io/react-native-storybook@x`)
 * resolves to a package.json whose `name` differs from the specifier, but
 * whose `version` is still the real protocol-version requirement. Any
 * failure - missing package, unreadable/invalid package.json, missing
 * version field - degrades to `undefined`; this reader never throws.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../constants';

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
    return typeof packageJson.version === 'string' ? packageJson.version : undefined;
  } catch {
    return undefined;
  }
}

export default readBundledSdkProtocolVersion;
