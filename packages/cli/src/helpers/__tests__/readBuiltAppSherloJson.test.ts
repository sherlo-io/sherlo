import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import readBuiltAppSherloJson from '../readBuiltAppSherloJson';

let appPath: string;

beforeEach(() => {
  appPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-json-')), 'Demo.app');
  fs.mkdirSync(appPath);
});

afterEach(() => {
  fs.rmSync(path.dirname(appPath), { recursive: true, force: true });
});

function write(relativePath: string, content: string) {
  const file = path.join(appPath, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const read = () =>
  readBuiltAppSherloJson({ binaryPath: appPath, fileName: 'Demo.app', projectRoot: appPath });

it("finds sherlo.json in the SDK framework's assets as well as the app's own assets folder", async () => {
  write(
    'Frameworks/sherlo_react_native_storybook.framework/assets/sherlo.json',
    '{"v":"framework"}'
  );
  expect(await read()).toBe('{"v":"framework"}');

  write('assets/sherlo.json', '{"v":"app"}');
  expect(await read()).toBe('{"v":"app"}');
});

it('answers nothing when the build holds no sherlo.json', async () => {
  expect(await read()).toBeUndefined();
});
