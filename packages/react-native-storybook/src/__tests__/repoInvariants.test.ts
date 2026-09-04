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
