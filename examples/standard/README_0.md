# Standard Example

This example demonstrates running visual tests on app builds with bundled JavaScript code using Sherlo. It includes a sample React Native app with Storybook and a GitHub Actions workflow.

<br />

## 🛠️ Prerequisites

Before getting started, ensure you have:
- An Expo account – sign up at https://expo.dev/signup if you don't have one
- A Sherlo account – sign up at https://app.sherlo.io if you don't have one

<br />

## ⚙️ Setup

1. Clone the repo: `git clone https://github.com/sherlo-io/sherlo`
2. Navigate to this example: `cd examples/standard`
3. Install dependencies: `yarn install` (or `npm install`)

<br />

## 🚀 How to Run

### Locally
1. Log in to EAS: `npx eas-cli login`
2. Link project to your Expo account: `npx eas-cli init`
3. Build the apps: `yarn build:android` (for Android) and `yarn build:ios` (for iOS)
4. Run test: `yarn sherlo:test --token [your Sherlo project token]` (or add the token to `sherlo.config.json`)
   - To get your token: Go to https://app.sherlo.io, create or select a project, navigate to Settings, and copy the token
   - Learn more about configuration: https://sherlo.io/docs/config#token
5. Review results in Sherlo app at https://app.sherlo.io

### Via GitHub Actions
1. Add secrets to your GitHub repo (Settings → Secrets and variables → Actions):
   - `EXPO_TOKEN`: Go to https://expo.dev/accounts/[your-account]/settings/access-tokens, create and copy a token, then add as secret
   - `SHERLO_TOKEN`: Go to https://app.sherlo.io, create or select a project, navigate to Settings, copy the token, then add as secret
2. Log in to EAS: `npx eas-cli login`
3. Link project to your Expo account: `npx eas-cli init`
4. Commit and push changes to `main` branch to trigger the workflow
5. Monitor the run in GitHub Actions tab and review results in Sherlo app at https://app.sherlo.io

<br />

## 🔄 Workflow Visualization
```
┌─────────────────────────────────────────────────────┐
│ 1. Make UI changes                                  │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. Build Android + iOS preview simulator builds     │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. Run Sherlo test                                  │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. Review visual changes in Sherlo app              │
└─────────────────────────────────────────────────────┘
```

For details, check `.github/workflows/standard.yml`.

<br />

## 📁 Key Project Files

This example includes several important files configured for Sherlo integration:

- **`.github/workflows/standard.yml`** – GitHub Actions workflow that automates the build and test process
- **`.rnstorybook/index.ts`** – Exports the updated Storybook component required by Sherlo (see [Storybook Component setup](https://sherlo.io/docs/setup#storybook-component))
- **`App.tsx`** – Main component that renders Storybook, making it accessible for Sherlo testing
- **`sherlo.config.json`** – Sherlo configuration file containing device settings, and optionally build paths or token

💡 **Integrating Sherlo in your own project:** This example was set up using `npx sherlo init`, which automatically creates and configures these files. To add Sherlo to your existing project, simply run this command in your project directory.

<br />

## ℹ️ Additional Notes

- **Build Alternatives:** This example uses EAS Build for app compilation. If you prefer other tools like React Native CLI or Native Build Tools (gradlew / xcodebuild), see our docs: https://sherlo.io/docs/builds?type=preview-simulator#build-types

<br />

## 🔗 Other Examples

- [../eas-update](../eas-update): Run visual tests using Over-The-Air updates for JavaScript changes, without full app rebuilds
- [../eas-cloud-build](../eas-cloud-build): Automatically run visual tests after builds complete on Expo servers