/**
 * metro/projectPaths.js: the one place a bundler path becomes a path from the project root.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toRelativePath, moduleMapKeyOf } = require('../../metro/projectPaths');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appModulePathsOf } = require('../../metro/stillReal');

describe('turning a bundler path into a path from the project root', () => {
  it('gives a path inside the project from the root with a leading dot-slash', () => {
    expect(toRelativePath('/app/src/Button.tsx', '/app')).toBe('./src/Button.tsx');
  });

  it('gives nothing for a virtual path or a path outside the project', () => {
    expect(toRelativePath('/app/src?ctx', '/app')).toBeNull();
    expect(toRelativePath('\0virtual', '/app')).toBeNull();
    expect(toRelativePath('/other/x.ts', '/app')).toBeNull();
  });

  it('gives a root file whose name starts with two dots its key', () => {
    expect(toRelativePath('/app/..foo.ts', '/app')).toBe('./..foo.ts');
    expect(moduleMapKeyOf('/app/..foo.ts', '/app')).toBe('./..foo.ts');
  });

  it('keys a module outside the project by its path from the root, and leaves out its node_modules', () => {
    expect(moduleMapKeyOf('/packages/ui/x.ts', '/app/web')).toBe('../../packages/ui/x.ts');
    expect(moduleMapKeyOf('/app/node_modules/lib/i.js', '/app/web')).toBeNull();
    expect(moduleMapKeyOf('/app/web/src?ctx', '/app/web')).toBeNull();
  });

  it('is what the still-real list uses, less the leading dot-slash', () => {
    const modules = new Map([['/app/src/a.ts', {}]]);
    expect(appModulePathsOf(modules, () => 1, '/app')).toEqual({ 1: 'src/a.ts' });
  });
});
