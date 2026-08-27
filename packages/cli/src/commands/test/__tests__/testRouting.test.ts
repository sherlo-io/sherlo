/**
 * Tests for `sherlo test`'s ROAD CHOICE - the outer routing in ./test.ts.
 *
 * One rule decides everything: were native build paths given? The flags decide,
 * never the config file, so a caller that passes no `--android`/`--ios` is
 * asking the staged road's routing question whatever paths sherlo.config.json
 * happens to carry.
 *
 * Both roads are stubbed here - what is under test is WHICH one runs and what
 * reaches it, not what either does. The staged road's own behavior lives in
 * ./stagedRun.test.ts and ./stagedRouting.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stagedRun', () => ({ default: vi.fn() }));
vi.mock('../../testStandard', () => ({ default: vi.fn() }));

import _stagedRun from '../stagedRun';
import _testStandard from '../../testStandard';

const mockStagedRun = vi.mocked(_stagedRun);
const mockTestStandard = vi.mocked(_testStandard);

let test: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockStagedRun.mockResolvedValue({ url: 'http://app/staged' });
  mockTestStandard.mockResolvedValue({ url: 'http://app/standard' });

  const mod = await import('../test');
  test = mod.default;
});

describe('road choice', () => {
  it('takes the STAGED road when no build paths are given', async () => {
    const result = await test({ token: 'tok' });

    expect(mockStagedRun).toHaveBeenCalledTimes(1);
    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'http://app/staged' });
  });

  it.each([
    ['--android alone', { android: 'app.apk' }],
    ['--ios alone', { ios: 'app.tar.gz' }],
    ['both platforms', { android: 'app.apk', ios: 'app.tar.gz' }],
  ])('takes the STANDARD road with %s', async (_name, paths) => {
    const result = await test({ token: 'tok', ...paths });

    expect(mockTestStandard).toHaveBeenCalledTimes(1);
    expect(mockStagedRun).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'http://app/standard' });
  });

  it('forwards the options VERBATIM to the road it picked (same options surface)', async () => {
    const options = {
      token: 'tok',
      android: 'app.apk',
      message: 'a message',
      gitBranch: 'my-branch',
      include: 'Sanity',
      config: '/cfg.json',
      projectRoot: '/proj',
      wait: true,
      waitTimeout: '30',
    };

    await test(options);

    expect(mockTestStandard).toHaveBeenCalledWith(options);
  });

  it('forwards the options VERBATIM to the staged road too', async () => {
    const options = { token: 'tok', message: 'a message', wait: true };

    await test(options);

    expect(mockStagedRun).toHaveBeenCalledWith(options);
  });
});

// The preview flags preview what the staged road would decide and create no
// build. The standard road always creates one, so the combination is refused
// rather than silently ignored.
describe('preview flags are staged-road only', () => {
  it.each([
    ['--dry-run', { dryRun: true }],
    ['--emit-expectation', { dryRun: true, emitExpectation: 'token-missing' }],
  ])('refuses %s together with a build path', async (_name, previewFlags) => {
    await expect(test({ token: 'tok', android: 'app.apk', ...previewFlags })).rejects.toThrow();

    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it('allows the preview flags on the staged road', async () => {
    await test({ token: 'tok', dryRun: true });

    expect(mockStagedRun).toHaveBeenCalledTimes(1);
  });
});

// Both roads bundle, so a prebuilt bundle can be handed to either. Emitting one
// is a run-less operation, so a build path alongside it is refused rather than
// uploaded for nothing.
describe('bundle-supply flags', () => {
  it('forwards --bundle-dir to the STANDARD road together with a build path', async () => {
    const options = { token: 'tok', android: 'app.apk', bundleDir: '/tmp/bundles' };

    await test(options);

    expect(mockTestStandard).toHaveBeenCalledWith(options);
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it('refuses --emit-bundle-dir together with a build path', async () => {
    await expect(
      test({ token: 'tok', android: 'app.apk', emitBundleDir: '/tmp/bundles' })
    ).rejects.toThrow();

    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it.each([
    ['--bundle-dir', { bundleDir: '/tmp/bundles' }],
    ['--emit-bundle-dir', { emitBundleDir: '/tmp/bundles' }],
  ])('allows %s on the staged road', async (_name, supplyFlags) => {
    await test({ token: 'tok', ...supplyFlags });

    expect(mockStagedRun).toHaveBeenCalledTimes(1);
  });
});
