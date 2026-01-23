# Standard Example

This example demonstrates how to run visual tests on app builds with bundled JavaScript code using Sherlo. It includes a sample React Native app with Storybook and a GitHub Actions workflow.

<br />

## 🛠️ Prerequisites

Before getting started, ensure you have:
- An Expo account – sign up at https://expo.dev/signup
- A Sherlo account – create one at https://app.sherlo.io

<br />

## ⚙️ Setup

1. Clone the repo: `git clone https://github.com/sherlo-io/sherlo`
2. Navigate to this example: `cd examples/standard`
3. Install dependencies: `yarn install` (or `npm install`)

<br />

## 🚀 How to Run

### Locally

1. Log in to Expo (if needed): `npx eas-cli login`
2. Link the project with your Expo account: `npx eas-cli init`
3. Build preview simulator builds:
   - Android: `yarn build:android`
   - iOS: `yarn build:ios`
4. Run the Sherlo test:
   - `yarn sherlo:test --token [your Sherlo project token]`
   - Alternatively, add the token to `sherlo.config.json`
   - Token docs: https://sherlo.io/docs/config#token
5. Review results in the Sherlo web app

### Via GitHub Actions

1. Add the following secrets in your GitHub repository:
   - Go to: **Settings → Secrets and variables → Actions**
   - `EXPO_TOKEN` – create one at https://expo.dev/accounts/[your-account]/settings/access-tokens
   - `SHERLO_TOKEN` – copy from your Sherlo project in https://app.sherlo.io
2. Log in to Expo (if needed): `npx eas-cli login`
3. Link the project with your Expo account: `npx eas-cli init`
4. Commit and push changes to the `main` branch to trigger the workflow
5. Monitor the run in the GitHub Actions tab and review results in the Sherlo web app

<br />

## 🔄 Workflow Overview

1. Make UI changes
2. Build Android and iOS preview simulator builds
3. Run the Sherlo test
4. Review visual changes in the Sherlo web app

For details, see `.github/workflows/standard.yml`.

<br />

## 🗂️ Key Project Files

This example project is already configured as if `npx sherlo init` had been run. The most relevant files are:

- `.github/workflows/` – GitHub Actions workflow running builds and Sherlo tests
- `.rnstorybook/index.ts` – exports the Storybook component required by Sherlo
- `App.tsx` – renders Storybook as the root component of the app
- `sherlo.config.json` – Sherlo configuration (devices, build paths, token)

If you want to set up Sherlo in your own project, start with:
```
npx sherlo init
```


This command guides you through the setup and automatically creates or updates the required files.

<br />

## ℹ️ Additional Notes

- **Build alternatives**: This example uses EAS Build to create preview simulator builds. If you prefer other build tools (React Native CLI, `gradlew`, `xcodebuild`), see:
  https://sherlo.io/docs/builds?type=preview-simulator#build-types

<br />

## 🔗 Other Examples

- [../eas-update](../eas-update) – Run visual tests using Over-The-Air JavaScript updates without rebuilding the app
- [../eas-cloud-build](../eas-cloud-build) – Automatically run visual tests after builds complete on Expo servers
