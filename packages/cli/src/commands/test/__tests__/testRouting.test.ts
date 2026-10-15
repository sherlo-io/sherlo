/**
 * Tests for `sherlo test`'s ROAD CHOICE - the outer routing in ./test.ts.
 *
 * The config file's `simulation` field decides sim mode; every other push takes the staged road.
 * A Sherlo 2 binary path never gets this far: start.ts refuses it first.
 *
 * Both roads are stubbed here - what is under test is WHICH one runs and what
 * reaches it, not what either does. The staged road's own behavior lives in
 * ./stagedRun.test.ts and ./stagedRouting.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stagedRun', () => ({ default: vi.fn() }));
vi.mock('../simRun', () => ({ default: vi.fn() }));
vi.mock('../simWorld', () => ({
  resolveSimulationWorldPath: vi.fn(),
  SIMULATION_CONFIG_FIELD: 'simulation',
}));

import _stagedRun from '../stagedRun';
import _simRun from '../simRun';
import { resolveSimulationWorldPath as _resolveSimulationWorldPath } from '../simWorld';
import { renderBinaryPathFlagGone } from '../../../render/appBuild';

const mockStagedRun = vi.mocked(_stagedRun);
const mockSimRun = vi.mocked(_simRun);
const mockResolveSimulationWorldPath = vi.mocked(_resolveSimulationWorldPath);

let test: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockStagedRun.mockResolvedValue({ url: 'http://app/staged' });
  mockSimRun.mockResolvedValue({ url: 'http://app/sim' });
  mockResolveSimulationWorldPath.mockReturnValue(undefined);

  const mod = await import('../test');
  test = mod.default;
});

describe('road choice', () => {
  it('takes the STAGED road whenever the config declares no simulation', async () => {
    const result = await test({ message: 'a message' });

    expect(mockStagedRun).toHaveBeenCalledTimes(1);
    expect(mockSimRun).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'http://app/staged' });
  });

  it('forwards the options VERBATIM to the staged road', async () => {
    const options = { message: 'a message', wait: true, waitTimeout: '30', projectRoot: '/proj' };

    await test(options);

    expect(mockStagedRun).toHaveBeenCalledWith(options);
  });

  it('refuses a Sherlo 2 binary path flag, naming sherlo test, sherlo build and the build command a project can set', () => {
    const { message, below } = renderBinaryPathFlagGone();
    const refusal = `${message}\n${below}`;

    expect(refusal).toContain('`--android` or `--ios`');
    expect(refusal).toContain('npx sherlo test');
    expect(refusal).toContain('npx sherlo build');
    expect(refusal).toContain('build.android.command');
  });
});

// Sim-ness lives in the config file's `simulation` field and nowhere else: when
// it resolves to a world TREE the run takes the sim road alone; the bundler-road
// flags are refused alongside it rather than half-honored.
describe('the sim road', () => {
  it('routes to the SIM road when the config declares a simulation, handing it the world path', async () => {
    mockResolveSimulationWorldPath.mockReturnValue('/proj/sim-world');
    const options = { token: 'tok' };

    const result = await test(options);

    // The path handed on is the tree's DIRECTORY - what the reader walks.
    expect(mockSimRun).toHaveBeenCalledWith(options, '/proj/sim-world');
    expect(mockStagedRun).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'http://app/sim' });
  });

  it('asks the config file itself - the options are handed to the resolver verbatim', async () => {
    mockResolveSimulationWorldPath.mockReturnValue('/proj/worlds/w');
    const options = { token: 'tok', config: 'sherlo.config.json', projectRoot: '/proj' };

    await test(options);

    expect(mockResolveSimulationWorldPath).toHaveBeenCalledWith(options);
    expect(mockSimRun).toHaveBeenCalledWith(options, '/proj/worlds/w');
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it.each([
    ['--bundle-dir', { bundleDir: '/tmp/bundles' }],
    ['--emit-bundle-dir', { emitBundleDir: '/tmp/bundles' }],
  ])('refuses a sim world together with %s', async (flagName, flags) => {
    mockResolveSimulationWorldPath.mockReturnValue('/proj/sim-world');

    await expect(test({ token: 'tok', ...flags })).rejects.toThrow(
      new RegExp(`${flagName}.*runs no\\s+bundler`, 's')
    );

    expect(mockSimRun).not.toHaveBeenCalled();
    expect(mockStagedRun).not.toHaveBeenCalled();
  });

  it('leaves the staged road untouched when no sim world is in play', async () => {
    mockResolveSimulationWorldPath.mockReturnValue(undefined);

    await test({ token: 'tok' });

    expect(mockSimRun).not.toHaveBeenCalled();
    expect(mockStagedRun).toHaveBeenCalledTimes(1);
  });
});

// The staged road bundles, so a prebuilt bundle can be handed to it, and a bundle directory can
// be produced by it.
describe('bundle-supply flags', () => {
  it.each([
    ['--bundle-dir', { bundleDir: '/tmp/bundles' }],
    ['--emit-bundle-dir', { emitBundleDir: '/tmp/bundles' }],
  ])('allows %s on the staged road', async (_name, supplyFlags) => {
    await test({ token: 'tok', ...supplyFlags });

    expect(mockStagedRun).toHaveBeenCalledTimes(1);
  });
});
