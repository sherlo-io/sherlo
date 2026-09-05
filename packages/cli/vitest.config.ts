import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/__tests__/**/*.test.ts',
      // The GitHub Action's library (../../actions/lib) is the OTHER SIDE of this
      // CLI's stdout contract: the CLI prints `key=value` lines, the action parses
      // them and resolves which installed CLI to run. Both halves run in ONE suite
      // so a change to the printed keys cannot pass while the parser still expects
      // the old ones. The action ships as plain .mjs with no build and no deps, so
      // it needs no package of its own.
      '../../actions/lib/__tests__/**/*.test.mjs',
    ],
    globals: true,
  },
});
