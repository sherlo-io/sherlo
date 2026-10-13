import { afterEach, describe, expect, it, vi } from 'vitest';
import waitForEnterPress from '../../helpers/waitForEnterPress';
import builds from '../builds';

vi.mock('../../helpers/trackProgress', () => ({ default: vi.fn(async () => ({})) }));
vi.mock('../../helpers/waitForEnterPress', () => ({ default: vi.fn(async () => {}) }));

describe('init Builds step', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the Builds step says sherlo test builds the app with Gradle and Xcode, and asks nothing', async () => {
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      printed.push(line);
    });

    await builds({ sessionId: null });

    const text = printed.join('\n');
    expect(text).toContain('npx sherlo test');
    expect(text).toContain('Gradle');
    expect(text).toContain('Xcode');
    expect(text).not.toMatch(/EAS|--eas/);
    expect(waitForEnterPress).not.toHaveBeenCalled();
  });
});
