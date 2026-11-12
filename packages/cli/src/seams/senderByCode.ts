/**
 * THE PACKAGE WHOSE CODE NAMES A REQUEST'S HOST, found in the project's node_modules.
 *
 * A request an SDK sends from native code has no JavaScript stack, so no package can be read off
 * it; and a stack the bundler could not map names none either. The next best signal is the code
 * itself: a package the app depends on that carries the host in its source (JavaScript, or the
 * Kotlin, Java, Swift and Objective-C of its native side) most probably sent it. The answer is a
 * guess and is told as one (`how: 'code'`, see ./requestSender).
 *
 * Only the packages the app's own package.json depends on are read, each once per run, up to a
 * byte cap, and only when some request has no package named by its stack.
 */
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import type { UnansweredRequest } from './readAppAnswer';
import { hostOf, isRequestPlumbing, senderOf } from './requestSender';

const SOURCE_FILES = '**/*.{kt,java,swift,m,mm,h,cpp,js,jsx,ts,tsx}';
const SKIPPED_FOLDERS = [
  '**/node_modules/**',
  '**/__tests__/**',
  '**/example/**',
  '**/Pods/**',
  '**/build/**',
];
/** Deep enough for `android/src/main/java/com/vendor/sdk/Client.kt` and every standard iOS layout. */
const SOURCE_DEPTH = 12;
const MAX_BYTES_PER_PACKAGE = 4_000_000;
const NATIVE_FILE = /\.(kt|java|swift|mm?|h|cpp)$/;

/** The names of the packages the project's package.json depends on; none when it has no readable one. */
function dependenciesOf(projectFolder: string): string[] {
  try {
    const { dependencies } = JSON.parse(
      fs.readFileSync(path.join(projectFolder, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };
    return Object.keys(dependencies ?? {});
  } catch {
    // No readable package.json: the project names no dependencies, so no package is looked in.
    return [];
  }
}

/** A package's source, native files first, read until the byte cap; lower case. */
function sourceOf(packageFolder: string): string {
  const files = fg
    .sync(SOURCE_FILES, { cwd: packageFolder, ignore: SKIPPED_FOLDERS, deep: SOURCE_DEPTH })
    .sort((a, b) => Number(NATIVE_FILE.test(b)) - Number(NATIVE_FILE.test(a)));
  let bytes = 0;
  const texts: string[] = [];
  for (const file of files) {
    const full = path.join(packageFolder, file);
    bytes += fs.statSync(full).size;
    if (bytes > MAX_BYTES_PER_PACKAGE) break;
    texts.push(fs.readFileSync(full, 'utf8'));
  }
  return texts.join('\n').toLowerCase();
}

/** A lookup from a request's address to the dependency whose code holds its host, reading each package once. */
function packageNamingHost(projectFolder: string): (url: string) => string | undefined {
  const nodeModules = path.join(projectFolder, 'node_modules');
  // A package that only carries requests (React Native, Sherlo, compiler helpers) holds hosts it never sends to.
  const names = dependenciesOf(projectFolder).filter(
    (name) => !isRequestPlumbing(name) && fs.existsSync(path.join(nodeModules, name))
  );
  const sources = new Map<string, string>();

  return (url) => {
    const host = hostOf(url);
    if (host === undefined) return undefined;
    return names.find((name) => {
      if (!sources.has(name)) sources.set(name, sourceOf(path.join(nodeModules, name)));
      return sources.get(name)?.includes(host) === true;
    });
  };
}

/**
 * The same answer with each request no call stack names a package for marked with the dependency
 * whose code names its host (`codeNames`); every other request stays as it is.
 */
export function nameSendersByCode<Answer extends { unanswered?: UnansweredRequest[] }>(
  answer: Answer,
  projectFolder: string
): Answer {
  const unnamed = (request: UnansweredRequest) => senderOf(request)?.how !== 'stack';
  if (!answer.unanswered?.some(unnamed)) return answer;
  const packageFor = packageNamingHost(projectFolder);
  return {
    ...answer,
    unanswered: answer.unanswered.map((request) => {
      const codeNames = unnamed(request) ? packageFor(request.url) : undefined;
      return codeNames === undefined ? request : { ...request, codeNames };
    }),
  };
}
