/**
 * Repo invariants for the public package (design.md "Testing ownership").
 *
 * The public package must never name private source IN A BUILD FILE. PoC
 * FINDINGS.md #1: `sherlo-public/android/CMakeLists.txt` once built `agent.c`,
 * the INJECTED implementation whose source lives in the private half - React
 * Native autolinks the public module automatically, so any customer without
 * Sherlo's private repo checked out beside their app got "Cannot find source
 * file: src/main/cpp/agent.c" in an app that had done nothing wrong, and even
 * where the build DID find it, the public build system pointed at private
 * source at all. This scans the files that actually drive a customer's native
 * build (CMakeLists.txt, build.gradle, the podspec) for the private
 * implementation's own file/library names - not prose: an explanatory comment
 * naming what moved where is fine and expected, a build rule compiling or
 * linking it is the bug.
 */
import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ROOT = path.join(__dirname, '../..');

/** Native artifact names that belong only to the injected implementation. */
const FORBIDDEN_BUILD_REFERENCES = ['agent.c', 'libsherloimpl', 'sherlo-runner'];

/** The files that actually drive a customer's native build. */
const BUILD_FILES = [
  'android/CMakeLists.txt',
  'android/build.gradle',
  'sherlo-react-native-storybook.podspec',
];

describe('repo invariant - the native build never compiles or links private source', () => {
  it.each(BUILD_FILES)('%s names none of the injected implementation’s artifacts', (relPath) => {
    const absPath = path.join(PACKAGE_ROOT, relPath);
    const content = fs.readFileSync(absPath, 'utf8');

    const offenders = FORBIDDEN_BUILD_REFERENCES.filter((name) => content.includes(name));
    expect(offenders).toEqual([]);
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

/**
 * The shim must take React Native's own dedicated TurboModule queue, not
 * override it. Leaving `methodQueue` unimplemented makes
 * `RCTTurboModuleManager` fall back to its `_sharedModuleQueue` - a serial
 * queue that exists solely to run native-module methods. Overriding it to
 * return `RCTGetUIManagerQueue()` instead puts every Sherlo native call on
 * the Shadow Queue, the same queue reanimated, gesture-handler and svg use
 * for their own shadow-tree work, so Sherlo calls queue up behind whatever
 * those libraries are doing.
 */
describe('repo invariant - the iOS shim takes React Native’s own TurboModule queue', () => {
  it('SherloModule.mm declares no methodQueue override', () => {
    const shimSource = fs.readFileSync(SHIM_PATH, 'utf8');
    expect(shimSource).not.toMatch(/-\s*\(dispatch_queue_t\)\s*methodQueue/);
  });
});
