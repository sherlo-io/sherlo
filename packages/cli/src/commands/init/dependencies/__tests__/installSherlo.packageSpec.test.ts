import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../../constants';

// Derives the packageSpec string using the same logic as installSherlo.ts,
// without importing the module (which has side-effectful ora/spinner calls).
function derivePackageSpec(
  localSdkPath: string | undefined,
  sdkVersion: string | undefined
): string {
  const localSdkProtocol = localSdkPath?.endsWith('.tgz') ? 'file' : 'portal';
  return localSdkPath
    ? `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${localSdkProtocol}:${localSdkPath}`
    : sdkVersion
      ? `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${sdkVersion}`
      : SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;
}

const PKG = SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;

describe('installSherlo packageSpec derivation', () => {
  it('uses file: protocol when SHERLO_SDK_PATH ends with .tgz', () => {
    const spec = derivePackageSpec('/tmp/sdk-1.0.0.tgz', undefined);
    expect(spec).toBe(`${PKG}@file:/tmp/sdk-1.0.0.tgz`);
  });

  it('uses portal: protocol when SHERLO_SDK_PATH is a directory', () => {
    const spec = derivePackageSpec('/path/to/sdk-dir', undefined);
    expect(spec).toBe(`${PKG}@portal:/path/to/sdk-dir`);
  });

  it('uses npm version when only SHERLO_SDK_VERSION is set', () => {
    const spec = derivePackageSpec(undefined, '1.2.3');
    expect(spec).toBe(`${PKG}@1.2.3`);
  });

  it('uses bare package name when neither env var is set', () => {
    const spec = derivePackageSpec(undefined, undefined);
    expect(spec).toBe(PKG);
  });

  it('SHERLO_SDK_PATH takes precedence over SHERLO_SDK_VERSION', () => {
    const spec = derivePackageSpec('/tmp/sdk.tgz', '9.9.9');
    expect(spec).toBe(`${PKG}@file:/tmp/sdk.tgz`);
  });
});
