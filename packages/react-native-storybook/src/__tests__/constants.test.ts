import * as fs from 'fs';
import * as path from 'path';
import {
  VERIFICATION_TEST_ID,
  DUMMY_STORY_ID,
  ANDROID_SHIM_LIBRARY_NAME,
  IOS_SHIM_REGISTRATION_SYMBOL,
  SEAM_VERSION_GLOBAL_NAME,
  SEAM_VERSION_GATE_REGEX,
} from '../constants';

const PACKAGE_ROOT = path.join(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(PACKAGE_ROOT, relPath), 'utf8');
}

describe('SDK constants', () => {
  it('VERIFICATION_TEST_ID has expected value', () => {
    expect(VERIFICATION_TEST_ID).toBe('sherlo-getStorybook-verification');
  });

  it('DUMMY_STORY_ID follows StoryId format (contains --)', () => {
    expect(DUMMY_STORY_ID).toContain('--');
    expect(DUMMY_STORY_ID).toBe('SherloInitialTestingDummyStory--SherloDummyStory');
  });

  it('DUMMY_STORY_ID is a valid StoryId pattern', () => {
    // StoryId = `${string}--${string}`
    const parts = DUMMY_STORY_ID.split('--');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });
});

/**
 * ARCHITECT RULING (cross-repo contract, 2026-09-04): the runner lane has
 * landed its side of the native ABI and base-binary check against these exact
 * strings - they are canonical and this package must produce them EXACTLY.
 * Pinned here as literals AND cross-checked against the actual native/seam
 * source below, so a rename on either side breaks a test instead of silently
 * drifting the two repos apart.
 */
describe('cross-repo canonical constants (runner base-binary gate)', () => {
  it('ANDROID_SHIM_LIBRARY_NAME is the exact literal the runner gate reads', () => {
    expect(ANDROID_SHIM_LIBRARY_NAME).toBe('sherloshim');
  });

  it('ANDROID_SHIM_LIBRARY_NAME matches the CMake target that actually produces libsherloshim.so', () => {
    const cmake = read('android/CMakeLists.txt');
    expect(cmake).toMatch(new RegExp(`add_library\\(${ANDROID_SHIM_LIBRARY_NAME}\\s+SHARED`));
  });

  it('IOS_SHIM_REGISTRATION_SYMBOL is the exact literal the runner gate reads', () => {
    expect(IOS_SHIM_REGISTRATION_SYMBOL).toBe('SherloShimRegisterImplV1');
  });

  it('IOS_SHIM_REGISTRATION_SYMBOL matches the exported C symbol declared in SherloImplV1.h and defined in SherloModule.mm', () => {
    const header = read('ios/SherloImplV1.h');
    const impl = read('ios/SherloModule.mm');
    expect(header).toContain(`void ${IOS_SHIM_REGISTRATION_SYMBOL}(SherloImplV1 *impl);`);
    expect(impl).toContain(`void ${IOS_SHIM_REGISTRATION_SYMBOL}(SherloImplV1 *impl)`);
  });

  it('the Android JNI shim resolves the implementation via SherloGetImplV1 / SherloSetHostV1, exactly as the PoC does', () => {
    const jni = read('android/src/main/cpp/sherlo-shim-jni.cpp');
    expect(jni).toContain('dlsym(RTLD_DEFAULT, "SherloGetImplV1")');
    expect(jni).toContain('dlsym(RTLD_DEFAULT, "SherloSetHostV1")');
  });

  it('SEAM_VERSION_GLOBAL_NAME is the exact literal the runner gate reads', () => {
    expect(SEAM_VERSION_GLOBAL_NAME).toBe('__SHERLO_SEAM_VERSION__');
  });

  it('SEAM_VERSION_GATE_REGEX matches seam.js\'s real output and extracts "1"', () => {
    const seamSource = read('src/seam.js');
    const match = seamSource.match(SEAM_VERSION_GATE_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('1');
  });

  it('SEAM_VERSION_GATE_REGEX matches both single- and double-quoted forms', () => {
    expect(`globalThis.${SEAM_VERSION_GLOBAL_NAME} = '1';`).toMatch(SEAM_VERSION_GATE_REGEX);
    expect(`globalThis.${SEAM_VERSION_GLOBAL_NAME} = "1";`).toMatch(SEAM_VERSION_GATE_REGEX);
  });

  it('all four are re-exported from the package root (`.`) - there is no dedicated ./constants subpath', async () => {
    const rootExports = await import('../index');
    expect(rootExports.ANDROID_SHIM_LIBRARY_NAME).toBe(ANDROID_SHIM_LIBRARY_NAME);
    expect(rootExports.IOS_SHIM_REGISTRATION_SYMBOL).toBe(IOS_SHIM_REGISTRATION_SYMBOL);
    expect(rootExports.SEAM_VERSION_GLOBAL_NAME).toBe(SEAM_VERSION_GLOBAL_NAME);
    expect(rootExports.SEAM_VERSION_GATE_REGEX).toBe(SEAM_VERSION_GATE_REGEX);
  });
});
