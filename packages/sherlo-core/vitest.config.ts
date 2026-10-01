import { defineConfig } from 'vitest/config';

// A machine that runs several jobs side by side sets BRAIN_SLOT_CPUS to this run's share of its
// cores, so the run does not take them all. Unset (a plain local run, or CI), vitest's own default.
const slotCpus = Number(process.env.BRAIN_SLOT_CPUS);
const maxWorkers = slotCpus > 0 ? slotCpus : undefined;

export default defineConfig({
  test: {
    // The JS core's tests, and the C core's harness (compiled for this machine with its `cc`).
    include: ['js/__tests__/**/*.test.ts', 'native/__tests__/**/*.test.ts'],
    globals: true,
    maxWorkers,
    // Building the core (esbuild + terser + obfuscator) is the slow part of sealedBuild.test.ts.
    testTimeout: 60_000,
  },
});
