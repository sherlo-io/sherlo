import { describe, expect, it } from 'vitest';
import { buildRerunArgs } from '../executeCommand';

describe('buildRerunArgs - re-run hint flag formatting', () => {
  it('converts camelCase option keys to kebab-case CLI flags', () => {
    const args = buildRerunArgs('test:standard', {
      gitBranch: 'my-feature',
      projectRoot: '/app',
      token: 'tok123',
    });

    expect(args).toContain('--git-branch');
    expect(args).toContain('--project-root');
    expect(args).toContain('--token');
    // No camelCase flags in the output.
    expect(args.join(' ')).not.toMatch(/--[a-z]+[A-Z]/);
  });

  it('emits --git-branch, not --gitBranch', () => {
    const args = buildRerunArgs('test:standard', { gitBranch: 'feature/foo' });

    expect(args).toContain('--git-branch');
    expect(args).toContain('feature/foo');
    expect(args).not.toContain('--gitBranch');
  });

  it('omits falsy string values', () => {
    const args = buildRerunArgs('test:standard', { gitBranch: '', token: 'tok' });

    expect(args).not.toContain('--git-branch');
    expect(args).toContain('--token');
  });

  it('emits boolean flags without a value when true, omits when false', () => {
    const args = buildRerunArgs('test:eas-cloud-build', {
      waitForEasBuild: true,
      someBoolFalse: false,
    });

    expect(args).toContain('--wait-for-eas-build');
    expect(args).not.toContain('--some-bool-false');
  });

  it('prefixes the command as the first element', () => {
    const args = buildRerunArgs('test:standard', { token: 'x' });

    expect(args[0]).toBe('test:standard');
  });
});
