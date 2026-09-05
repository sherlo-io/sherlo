import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
    // One emulator, one app: cases must not race each other on the device.
    fileParallelism: false,
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
  },
});
