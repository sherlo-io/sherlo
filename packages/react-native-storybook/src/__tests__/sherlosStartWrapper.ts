/**
 * Sherlo's start wrapper (metro/applySherloTransforms.js), run the way the bundle runs it: as its
 * own generated source, with a `require` that answers for the packages it reaches for. What the
 * wrapper does is decided by the bytes that are written, not by the function that wrote them.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../metro/applySherloTransforms');

/** The wrapper's source, as applySherloTransforms writes it. */
export function writtenStartWrapper(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-start-wrapper-'));
  const wrapperPath = path.join(tmpDir, 'storybook-wrapper.js');
  applySherloTransforms.generateWrapper(wrapperPath);
  const source = fs.readFileSync(wrapperPath, 'utf8');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return source;
}

/** Run the wrapper's `source`, answering each module it requires from `modules`, by name. */
export function loadStartWrapper(
  source: string,
  modules: Record<string, unknown>
): { exports: any } {
  const wrapper = { exports: {} as any };
  const answerRequire = (name: string): unknown => {
    if (name in modules) return modules[name];
    throw new Error(`the wrapper asked for an unexpected module: ${name}`);
  };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', source)(wrapper.exports, answerRequire, wrapper);
  return wrapper;
}

/** One folder of story files, as Storybook's generated requires file hands it over. */
export function storyFolder(directory: string, files: Record<string, unknown>) {
  const req = Object.assign((filename: string) => files[filename], {
    keys: () => Object.keys(files),
  });
  return { directory, req };
}
