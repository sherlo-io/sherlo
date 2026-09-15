import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // react is a peerDependency, not installed in this workspace - alias to a
      // minimal stub so component-level tests can import files that reference it.
      react: path.resolve(__dirname, 'src/__tests__/__mocks__/react.ts'),
      // react-native/index.js uses Flow syntax (`import typeof`) that Vite/Rollup
      // cannot parse. Alias to a minimal stub for the test environment.
      'react-native': path.resolve(__dirname, 'src/__tests__/__mocks__/react-native.ts'),
      // expo-dev-menu is an optional native peer dependency not installed in dev.
      'expo-dev-menu': path.resolve(__dirname, 'src/__tests__/__mocks__/expo-dev-menu.ts'),
    },
  },
  // tsconfig targets the automatic JSX runtime ("jsx": "react-jsx") for the
  // package's real build, which would otherwise pull in the react/jsx-(dev-)runtime
  // subpaths - not worth stubbing on top of the react.ts alias above. Force the
  // classic transform for the test build only, so JSX in .tsx source compiles to
  // plain React.createElement calls against the stub.
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
  },
});
