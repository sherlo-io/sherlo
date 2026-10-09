import { defineConfig } from 'vitest/config';
import path from 'path';

// A machine that runs several jobs side by side sets BRAIN_SLOT_CPUS to this run's share of its
// cores, so the run does not take them all. Unset (a plain local run, or CI), vitest's own default.
const slotCpus = Number(process.env.BRAIN_SLOT_CPUS);
const maxWorkers = slotCpus > 0 ? slotCpus : undefined;

export default defineConfig({
  resolve: {
    alias: {
      // react-native/index.js uses Flow syntax (`import typeof`) that Vite/Rollup
      // cannot parse. Alias to a minimal stub for the test environment.
      'react-native': path.resolve(__dirname, 'src/__tests__/__mocks__/react-native.ts'),
      // expo-dev-menu is an optional native peer dependency not installed in dev.
      'expo-dev-menu': path.resolve(__dirname, 'src/__tests__/__mocks__/expo-dev-menu.ts'),
    },
  },
  test: {
    // src/__tests__/**/*.test.ts covers today's tests; src/**/__tests__/**/*.test.tsx also picks
    // up a test co-located with the module it covers (getStorybook/__tests__), same as the rest
    // of this SDK's source tree is organized per-feature rather than flat.
    include: ['src/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    globals: true,
    maxWorkers,
    // A test file over five seconds fails the run, naming itself: the limit every suite shares.
    reporters: ['default', ['@sherlo-io/time-limits/vitest', { limit: 'ordinary' }]],
  },
});
