import { describe, it, expect } from 'vitest';
import { bootEmulator } from './emulator.js';
import { devices } from './adb.js';

const skip =
  process.env['SKIP_EMULATOR_TESTS'] === '1' ||
  (!process.env['ANDROID_HOME'] && !process.env['ANDROID_SDK_ROOT']);

describe.skipIf(skip)('emulator integration', { timeout: 300_000 }, () => {
  it('boots an emulator and shuts it down cleanly', async () => {
    const emulator = await bootEmulator();

    const before = devices();
    expect(before.some(d => d.serial === emulator.serial && d.state === 'device')).toBe(true);

    await emulator.shutdown();

    const after = devices();
    expect(after.some(d => d.serial === emulator.serial)).toBe(false);
  });
});
