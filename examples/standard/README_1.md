# Sherlo – Standard Testing Example

Minimal React Native + Storybook setup using Sherlo standard testing flow.

## What this example shows

- React Native app with Storybook enabled
- Standard Sherlo testing flow (local build)
- Manual and CI-friendly setup

## Requirements

- Node.js >= 18
- Expo CLI
- iOS Simulator or Android Emulator
- Sherlo account

## How to run

1. Clone the repository
   git clone https://github.com/sherlo/sherlo
   cd sherlo/examples/standard

2. Install dependencies
   npm install

3. Start the app
   npm run start

## Storybook integration

Storybook is conditionally rendered based on `isStorybookMode`.
When enabled, the app renders Storybook instead of the main application.

## Sherlo testing

- Storybook runs inside the native app
- Sherlo builds the app and captures screenshots on real devices
- Visual changes are detected automatically between runs

## Related docs

- Sherlo documentation: https://sherlo.io/docs/testing
- React Native Storybook
