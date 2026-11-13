import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../helpers', () => ({
  getCwd: vi.fn(),
  throwError: vi.fn((options: { message?: string; error?: Error }) => {
    throw options.error ?? new Error(options.message);
  }),
  getErrorWithCustomMessage: vi.fn((error: Error) => error),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-req-test-'));
  const { getCwd } = await import('../../../../helpers');
  vi.mocked(getCwd).mockReturnValue(tmpDir);
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

function writePackageJson(content: object) {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(content));
}

describe('setup checks the project it runs in', () => {
  it('an app that is its own workspace root and depends on React Native is accepted', async () => {
    writePackageJson({ workspaces: ['packages/*'], dependencies: { 'react-native': '0.76.0' } });
    const { default: validateProjectContext } = await import('../validateProjectContext');

    await expect(validateProjectContext()).resolves.toBeUndefined();
  });

  it('a monorepo root with no React Native of its own is still refused', async () => {
    writePackageJson({ workspaces: ['packages/*'] });
    const { default: validateProjectContext } = await import('../validateProjectContext');

    await expect(validateProjectContext()).rejects.toThrow('This folder is a monorepo root');
  });
});
