import { defineConfig } from 'vitest/config';

// A machine that runs several jobs side by side sets BRAIN_SLOT_CPUS to this run's share of its
// cores, so the run does not take them all. Unset (a plain local run, or CI), vitest's own default.
const slotCpus = Number(process.env.BRAIN_SLOT_CPUS);
const maxWorkers = slotCpus > 0 ? slotCpus : undefined;

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
    maxWorkers,
    // No test may touch this machine's keychain: a test that reaches the live saved logins keeps
    // them in the file, under the temporary folder it points XDG_CONFIG_HOME at. The keychain's
    // own cases hand the store a fake keychain instead.
    env: { SHERLO_SAVED_LOGIN_STORE: 'file' },
  },
});
