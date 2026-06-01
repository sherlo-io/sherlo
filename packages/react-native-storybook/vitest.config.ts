import { defineConfig } from 'vitest/config';
import path from 'path';

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
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
  },
});
