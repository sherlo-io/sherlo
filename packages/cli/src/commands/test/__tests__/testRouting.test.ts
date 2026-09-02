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
vi.mock('../simRun', () => ({ default: vi.fn() }));
vi.mock('../simWorld', () => ({
  resolveSimWorldPath: vi.fn(),
  SIM_WORLD_FILENAME: 'sim-world.json',
}));

import _stagedRun from '../stagedRun';
import _testStandard from '../../testStandard';
import _simRun from '../simRun';
import { resolveSimWorldPath as _resolveSimWorldPath } from '../simWorld';

const mockStagedRun = vi.mocked(_stagedRun);
const mockTestStandard = vi.mocked(_testStandard);
const mockSimRun = vi.mocked(_simRun);
const mockResolveSimWorldPath = vi.mocked(_resolveSimWorldPath);

let test: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockStagedRun.mockResolvedValue({ url: 'http://app/staged' });
  mockTestStandard.mockResolvedValue({ url: 'http://app/standard' });
  mockSimRun.mockResolvedValue({ url: 'http://app/sim' });
  mockResolveSimWorldPath.mockReturnValue(undefined);

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

// A sim world (explicit --sim, or a detected sim-world.json) IS the app, so it
// routes to the sim road alone; native build paths and the bundler-road flags
// are refused alongside it rather than half-honored.
describe('the sim road', () => {
  it('routes to the SIM road when --sim is passed, handing it the world path', async () => {
    mockResolveSimWorldPath.mockReturnValue({ filePath: '/worlds/w.json', explicit: true });
    const options = { token: 'tok', sim: '/worlds/w.json' };

    const result = await test(options);

    expect(mockSimRun).toHaveBeenCalledWith(options, '/worlds/w.json');
    expect(mockStagedRun).not.toHaveBeenCalled();
    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'http://app/sim' });
  });

  it('routes to the SIM road on a DETECTED sim-world.json too', async () => {
    mockResolveSimWorldPath.mockReturnValue({
      filePath: '/proj/sim-world.json',
      explicit: false,
    });

    await test({ token: 'tok' });

    expect(mockSimRun).toHaveBeenCalledWith({ token: 'tok' }, '/proj/sim-world.json');
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it('refuses a sim world together with native build paths', async () => {
    mockResolveSimWorldPath.mockReturnValue({ filePath: '/worlds/w.json', explicit: true });

    await expect(test({ token: 'tok', sim: '/worlds/w.json', android: 'app.apk' })).rejects.toThrow(
      /--sim.*cannot be\s+combined with.*--android/s
    );

    expect(mockSimRun).not.toHaveBeenCalled();
    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it.each([
    ['--dry-run', { dryRun: true }],
    ['--bundle-dir', { bundleDir: '/tmp/bundles' }],
    ['--emit-bundle-dir', { emitBundleDir: '/tmp/bundles' }],
    ['--emit-expectation', { dryRun: true, emitExpectation: 'token-missing' }],
  ])('refuses a sim world together with %s', async (flagName, flags) => {
    mockResolveSimWorldPath.mockReturnValue({ filePath: '/worlds/w.json', explicit: true });

    await expect(test({ token: 'tok', sim: '/worlds/w.json', ...flags })).rejects.toThrow(
      /runs no\s+bundler/
    );

    expect(mockSimRun).not.toHaveBeenCalled();
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it('leaves both existing roads untouched when no sim world is in play', async () => {
    mockResolveSimWorldPath.mockReturnValue(undefined);

    await test({ token: 'tok' });

    expect(mockSimRun).not.toHaveBeenCalled();
    expect(mockStagedRun).toHaveBeenCalledTimes(1);
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
