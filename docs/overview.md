# Sherlo SDK

Public npm packages for Sherlo visual testing of React Native applications.

## Packages

| Package | npm Name | Purpose |
|---------|----------|---------|
| CLI | `sherlo` | Command-line tool for running visual tests (`npx sherlo test`, `npx sherlo init`) |
| Storybook Integration | `@sherlo/react-native-storybook` | Wraps user's Storybook for screenshot capture |

## Monorepo Structure

Lerna monorepo with Yarn 4:

- `packages/cli/` — CLI tool (sherlo)
- `packages/react-native-storybook/` — Storybook integration (@sherlo/react-native-storybook)
- `sherlo-lib/extracted/` — Shared packages from sherlo-api (@sherlo/sdk-client, @sherlo/api-types, @sherlo/shared)

## How It Fits

The SDK is the developer-facing entry point to Sherlo:

1. Developer installs `sherlo` and `@sherlo/react-native-storybook`
2. CLI communicates with sherlo-api via AppSync GraphQL (using @sherlo/sdk-client)
3. Storybook integration runs inside the React Native app on device/simulator, communicating with sherlo-runner via file-based protocol

Cross-references:
- sherlo-brain/docs/system/sherlo-overview.md

## User Journey: First-Time Setup

1. **Developer** runs `npx sherlo init` → `packages/cli/src/commands/init/`
2. **CLI** prompts for project token → validates via API
3. **CLI** creates `sherlo.config.ts` in project root
4. **Developer** wraps their Storybook with `getStorybook()` from `@sherlo/react-native-storybook`
5. **Developer** runs `npx sherlo test` to trigger first visual test
