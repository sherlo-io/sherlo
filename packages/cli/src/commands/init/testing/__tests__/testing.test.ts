import { afterEach, describe, expect, it, vi } from 'vitest';
import testing from '../testing';

vi.mock('../../helpers/trackProgress', () => ({ default: vi.fn(async () => ({})) }));

describe('init Testing step', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names npx sherlo test with no paths, and says the first run builds and stores the app', async () => {
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      printed.push(line);
    });

    await testing(null);

    const text = printed.join('\n');
    expect(text).toContain('npx sherlo test');
    expect(text).not.toMatch(/--(android|ios)\b/);
    expect(text).toContain('The first run builds your app and stores the app build');
  });
});
