# @sherlo/integration-tests

SDK integration tests for Sherlo. These sit between unit tests and full E2E - they drive the SDK protocol (`config.sherlo`, `log.sherlo`, `protocol.sherlo`) against an emulator without the full runner + API + frontend pipeline.

## What this is

Unit tests verify individual functions in isolation. Full E2E tests require a running Sherlo backend. This harness fills the gap: it runs a real emulator session, exercises the SDK protocol primitives, and asserts on the outputs - all locally, no cloud required.

## Running

```bash
yarn install   # from the sherlo repo root
cd integration-tests
yarn test      # run all suites once
yarn test:watch  # run in watch mode
```

## Planned layout

```
integration-tests/
  apps/         # minimal fixture RN apps used as test subjects
  harness/      # test harness primitives (emulator control, protocol helpers, assertions)
  suites/       # vitest test suites
```

- **apps/** - bare-bones React Native apps (no UI needed) wired up with the Sherlo SDK. Each fixture app represents a specific configuration scenario.
- **harness/** - helpers for launching emulators, reading/writing protocol files, waiting for SDK signals, and asserting on captured screenshots or logs.
- **suites/** - the actual tests. Each suite targets one protocol flow or SDK feature.

## Status

This is a scaffold. Harness primitives and real test suites are coming in follow-up tasks.
