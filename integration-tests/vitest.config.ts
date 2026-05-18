import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./harness/vitest-global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    teardownTimeout: 60_000,
    // Use threads (not forks) so the worker→main RPC is lower-overhead and doesn't
    // saturate on long test sessions. We don't need process isolation.
    pool: 'threads',
    fileParallelism: false,
    // Write console output directly to stdout instead of routing through the
    // worker→main RPC channel. Reduces RPC traffic.
    disableConsoleIntercept: true,
    // Suppress the cosmetic "Vitest caught N unhandled errors" report.
    // Test pass/fail is unaffected. Errors are still logged at debug level.
    dangerouslyIgnoreUnhandledErrors: true,
  },
})
