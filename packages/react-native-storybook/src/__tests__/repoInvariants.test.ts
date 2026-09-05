/**
 * Repo invariants for the public package, checked from the OUTSIDE.
 *
 * Three separate invariants live here, in the order a customer meets them:
 *
 *   1. The package a customer's node_modules actually receives names no
 *      private-runtime source, anywhere.
 *   2. Every frozen export subpath resolves to a file that exists.
 *   3. The native shim is present on both platforms, and the iOS shim
 *      implements the selectors the frozen spec generates.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ANDROID_SHIM_LIBRARY_NAME, IOS_SHIM_REGISTRATION_SYMBOL } from '../constants';

const PACKAGE_ROOT = path.join(__dirname, '../..');

// ---------------------------------------------------------------------------
// 1 + 2. The built package, as installed
// ---------------------------------------------------------------------------
//
// Both invariants below judge the SHIPPED package rather than the source
// tree, so they need dist/ on disk. CI builds it before running the suite;
// locally, `yarn build` in this package does.

/**
 * Absolute paths of the files `npm pack` would put in the tarball - exactly
 * what package.json's `files` field resolves to, and exactly what a
 * customer's node_modules receives. Dev-only files (tests, docs, tsconfig)
 * are outside that list and never enter the scan.
 */
function shippedFiles(): string[] {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  const [{ files }] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
  return files.map((file) => path.join(PACKAGE_ROOT, file.path));
}

const SCANNED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.mjs',
  '.cjs',
  '.h',
  '.m',
  '.mm',
  '.cpp',
  '.java',
  '.kt',
  '.gradle',
  '.podspec',
  '.txt',
]);

/**
 * Names that can ONLY be a live reference to the private half - the private
 * runtime's own repo name and its native implementations' source files. A hit
 * means the split boundary was crossed by an accidental import, require,
 * #include, or CMake target.
 *
 * The failure this exists for: `android/CMakeLists.txt` once built `agent.c`,
 * the INJECTED implementation whose source lives in the private half. React
 * Native autolinks this module automatically, so every customer without that
 * private source beside their app got "Cannot find source file:
 * src/main/cpp/agent.c" in an app that had done nothing wrong - and where the
 * build DID find it, a public build system was compiling private source.
 *
 * `__SHERLO_ATTACH__` is deliberately NOT a marker: the seam legitimately
 * references that global (it is the door a spliced runtime knocks on), so its
 * presence here is correct, not a leak.
 */
const PRIVATE_SOURCE_MARKERS = ['sherlo-runner/', 'agent.c', 'libsherloimpl', 'sherlo-impl.m'];

/**
 * Strips comments so a doc comment naming what moved where is not read as a
 * live reference - an explanatory comment naming the private half is fine and
 * expected, a build rule compiling or linking it is the bug. Good enough for
 * a static scan, not a full lexer.
 */
function withoutComments(content: string, extension: string): string {
  if (extension === '.podspec') return content.replace(/#.*$/gm, ''); // Ruby line comments
  if (extension === '.json') return content; // no comment syntax to strip
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // C-family block comments, incl. /** JSDoc */
    .replace(/^[ \t]*\/\/.*$/gm, ''); // C-family line comments
}

describe('repo invariant - the package a customer installs', () => {
  beforeAll(() => {
    const builtEntry = path.join(PACKAGE_ROOT, 'dist/index.js');
    if (!fs.existsSync(builtEntry)) {
      throw new Error(
        `${builtEntry} is missing. These invariants judge the SHIPPED package - run ` +
          '`yarn build` in packages/react-native-storybook first (CI does it before ' +
          '`yarn test`).'
      );
    }
  });

  it('names no private-runtime source in any shipped file', () => {
    const offenders: string[] = [];

    for (const file of shippedFiles()) {
      const extension = path.extname(file);
      if (!SCANNED_EXTENSIONS.has(extension) || !fs.existsSync(file)) continue;

      const content = withoutComments(fs.readFileSync(file, 'utf8'), extension);
      for (const marker of PRIVATE_SOURCE_MARKERS) {
        if (content.includes(marker)) {
          offenders.push(`${path.relative(PACKAGE_ROOT, file)}: "${marker}"`);
        }
      }
    }

    expect(
      offenders,
      'a SHIPPED file names private-runtime source. The whole point of the split is that ' +
        `the private half never reaches a customer's disk:\n${offenders
          .map((offender) => `  ${offender}`)
          .join('\n')}`
    ).toHaveLength(0);
  });

  it('resolves every frozen export subpath to a file that exists', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
    ) as { exports: Record<string, string | Record<string, string>> };

    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      if (subpath === './package.json') continue; // resolves to itself, trivially present

      const relativeTarget =
        typeof target === 'string'
          ? target
          : target.require ?? target.default ?? target['react-native'] ?? target.types;
      if (!relativeTarget) {
        missing.push(`${subpath} (no require/default/react-native/types condition)`);
        continue;
      }
      if (!fs.existsSync(path.resolve(PACKAGE_ROOT, relativeTarget))) {
        missing.push(`${subpath} -> ${relativeTarget}`);
      }
    }

    expect(
      missing,
      'a subpath in package.json "exports" is what every shim and generated entry require ' +
        'resolves by literal string, forever - a missing target breaks every build that ' +
        `already shipped that literal. Missing:\n${missing.map((entry) => `  ${entry}`).join('\n')}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. The native shim, on both platforms
// ---------------------------------------------------------------------------
//
// constants.ts freezes the shim's library name and registration symbol
// specifically so nothing carries a second, hand-copied copy of them - so
// these assertions read the same declarations the runtime does rather than
// re-stating the literals.

describe('repo invariant - the native shim is present on both platforms', () => {
  it(`android/CMakeLists.txt builds lib${ANDROID_SHIM_LIBRARY_NAME}.so`, () => {
    const cmake = fs.readFileSync(path.join(PACKAGE_ROOT, 'android/CMakeLists.txt'), 'utf8');

    expect(
      cmake.includes(`add_library(${ANDROID_SHIM_LIBRARY_NAME} SHARED`),
      `android/CMakeLists.txt does not build a shared library named ` +
        `"${ANDROID_SHIM_LIBRARY_NAME}" (ANDROID_SHIM_LIBRARY_NAME) - the app would build ` +
        `without lib${ANDROID_SHIM_LIBRARY_NAME}.so ever landing in the APK`
    ).toBe(true);
  });

  it(`an ios/*.h header declares ${IOS_SHIM_REGISTRATION_SYMBOL}`, () => {
    const iosDir = path.join(PACKAGE_ROOT, 'ios');
    const headers = fs
      .readdirSync(iosDir)
      .filter((entry) => entry.endsWith('.h'))
      .map((entry) => fs.readFileSync(path.join(iosDir, entry), 'utf8'))
      .join('\n');

    expect(
      headers.includes(IOS_SHIM_REGISTRATION_SYMBOL),
      `no ios/*.h header declares "${IOS_SHIM_REGISTRATION_SYMBOL}" ` +
        '(IOS_SHIM_REGISTRATION_SYMBOL) - a late-attached implementation has no symbol to ' +
        'push through and the shim is silently inert'
    ).toBe(true);
  });

  it('a podspec sits at the package root', () => {
    expect(
      fs.existsSync(path.join(PACKAGE_ROOT, 'sherlo-react-native-storybook.podspec')),
      'no podspec at the package root - CocoaPods cannot see the package at all, so the ' +
        'iOS shim is silently absent from the binary while the build still succeeds'
    ).toBe(true);
  });
});

/**
 * The frozen spec and the iOS shim must agree on every SELECTOR, not just on
 * method names. React Native's codegen turns each spec method into an
 * Objective-C selector built from the method name plus the name of EVERY
 * parameter after the first (plus `resolve:reject:` when the method returns a
 * Promise), and it dispatches on that exact selector at runtime. So renaming a
 * parameter in the spec and not in `SherloModule.mm` produces a shim that
 * compiles, autolinks, and then cannot answer the call at all - which is how
 * `appendFile:content:` survived the six-method spec rewrite while the spec
 * said `base64Content`. Android is immune to this class of bug (it dispatches
 * positionally and the compiler checks the override), so only iOS is scanned.
 */
const SPEC_PATH = path.join(PACKAGE_ROOT, 'src/specs/NativeSherloModule.ts');
const SHIM_PATH = path.join(PACKAGE_ROOT, 'ios/SherloModule.mm');

/**
 * Reads `name: (paramA: T, paramB: T) => R;` entries out of the spec interface
 * and returns the Objective-C selector codegen will require for each.
 */
function selectorsRequiredBySpec(specSource: string): string[] {
  const methodPattern = /^ {2}(\w+): \(([^)]*)\) => (.+);$/gm;

  return Array.from(specSource.matchAll(methodPattern)).map((method) => {
    const [, methodName, parameterList, returnType] = method;

    const parameterNames = parameterList
      .split(',')
      .map((parameter) => parameter.trim().split(':')[0].trim())
      .filter((parameterName) => parameterName.length > 0);

    // The first parameter rides on the method name itself; every later one
    // contributes its own selector keyword.
    const keywords = [methodName, ...parameterNames.slice(1)];
    if (returnType.startsWith('Promise<')) keywords.push('resolve', 'reject');

    return keywords.length === 1 ? methodName : `${keywords.join(':')}:`;
  });
}

/** Every `- (...)` method the shim actually defines, as selector strings. */
function selectorsImplementedByShim(shimSource: string): string[] {
  const definitionPattern = /^- \([^)]*\)([\s\S]*?)\{/gm;

  return Array.from(shimSource.matchAll(definitionPattern)).map((definition) => {
    const header = definition[1];
    const keywords = Array.from(header.matchAll(/(\w+)\s*:/g)).map((keyword) => keyword[1]);

    return keywords.length === 0 ? header.trim() : `${keywords.join(':')}:`;
  });
}

describe('repo invariant - the iOS shim implements the selectors the spec generates', () => {
  const specSource = fs.readFileSync(SPEC_PATH, 'utf8');
  const shimSource = fs.readFileSync(SHIM_PATH, 'utf8');
  const implemented = selectorsImplementedByShim(shimSource);

  it('finds all six spec methods', () => {
    expect(selectorsRequiredBySpec(specSource)).toEqual([
      'getSherloConstants',
      'reportEarlyJsError:message:stack:',
      'appendFile:base64Content:resolve:reject:',
      'readFile:resolve:reject:',
      'invoke:argsJson:resolve:reject:',
      'invokeSync:argsJson:',
    ]);
  });

  it.each(selectorsRequiredBySpec(specSource))('SherloModule.mm implements %s', (selector) => {
    expect(implemented).toContain(selector);
  });
});
