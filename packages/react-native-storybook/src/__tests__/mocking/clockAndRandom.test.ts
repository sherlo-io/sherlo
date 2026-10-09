/**
 * A story freezes the clock to a moment and seeds random, so a screen that shows a date or a
 * shuffle shows the same thing every time.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

// RunnerBridge is only reached by activateStoryMocks' unshimmed-key warning; stub it so these
// tests don't depend on the native bridge.
vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { describe, it, expect, afterEach } from 'vitest';
import { activateStoryMocks } from '../../mocking/activateStoryMocks';
import { clearMocks } from '../../mocking/registry';
import { mockClock } from '../../mocking/clock';
import { mockRandom } from '../../mocking/random';
import { resolveDeclarations } from '../../mocking/mockDeclaration';

afterEach(() => {
  clearMocks();
  mockGetMode.mockReset();
});

describe('the clock is frozen by the story', () => {
  it('the clock reads the moment the story names', async () => {
    mockGetMode.mockReturnValue('testing');
    activateStoryMocks(await resolveDeclarations([mockClock('2020-01-02T03:04:05.000Z')]));

    expect(new Date().toISOString()).toBe('2020-01-02T03:04:05.000Z');
    expect(new Date(Date.now()).toISOString()).toBe('2020-01-02T03:04:05.000Z');
  });

  it('a Date made with arguments is untouched; only now is frozen', async () => {
    mockGetMode.mockReturnValue('testing');
    activateStoryMocks(await resolveDeclarations([mockClock('2020-01-02T03:04:05.000Z')]));

    expect(new Date('2021-06-07T08:09:10.000Z').toISOString()).toBe('2021-06-07T08:09:10.000Z');
    expect(new Date(2021, 5, 7).getFullYear()).toBe(2021);
  });

  it('leaving the story restores the real clock', async () => {
    mockGetMode.mockReturnValue('testing');
    activateStoryMocks(await resolveDeclarations([mockClock('2020-01-02T03:04:05.000Z')]));
    expect(new Date().toISOString()).toBe('2020-01-02T03:04:05.000Z');

    activateStoryMocks({});

    const now = Date.now();
    expect(Math.abs(now - Date.now())).toBeLessThan(1000);
    expect(new Date().toISOString()).not.toBe('2020-01-02T03:04:05.000Z');
  });
});

describe('random is seeded by the story', () => {
  it('random repeats the same sequence from the seed on every activation', async () => {
    mockGetMode.mockReturnValue('testing');

    activateStoryMocks(await resolveDeclarations([mockRandom(42)]));
    const first = [Math.random(), Math.random(), Math.random()];

    activateStoryMocks(await resolveDeclarations([mockRandom(42)]));
    const second = [Math.random(), Math.random(), Math.random()];

    expect(second).toEqual(first);
  });

  it('leaving the story restores the real random', async () => {
    mockGetMode.mockReturnValue('testing');
    const realRandom = Math.random;

    activateStoryMocks(await resolveDeclarations([mockRandom(42)]));
    expect(Math.random).not.toBe(realRandom);

    activateStoryMocks({});

    expect(Math.random).toBe(realRandom);
  });
});

describe('the clock and random follow the story', () => {
  it('neither is installed outside testing and storybook mode', async () => {
    mockGetMode.mockReturnValue('default');
    const realRandom = Math.random;
    const realDate = Date;

    activateStoryMocks(
      await resolveDeclarations([mockClock('2020-01-02T03:04:05.000Z'), mockRandom(42)])
    );

    expect(Math.random).toBe(realRandom);
    expect(Date).toBe(realDate);
  });
});
