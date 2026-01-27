# Standard Example

This workflow runs visual tests on app builds **with bundled JavaScript code.**

It includes a minimal React Native + Storybook setup and a GitHub Actions workflow.

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

For implementation details, see [`.github/workflows/standard.yml`](./.github/workflows/standard.yml).

<br />

## 🛠️ Prerequisites

Before getting started, ensure you have:

- A Sherlo account – sign up at https://app.sherlo.io
- An Expo account (for EAS Build) – sign up at https://expo.dev/signup

<br />

## ⚙️ Setup

```bash
# Clone the repository
git clone https://github.com/sherlo-io/sherlo.git

# Navigate to this example
cd sherlo/examples/standard

# Install dependencies
yarn install
```

<br />

## 🚀 How to Run

### via GitHub Actions

1. **Configure EAS:**
```bash
# Log in to EAS
npx eas-cli login

# Link project to your Expo account
npx eas-cli init
```

2. **Add secrets to your GitHub repo** (Settings → Secrets and variables → Actions):
   - `EXPO_TOKEN`: Go to https://expo.dev/accounts/[your-account]/settings/access-tokens, create and copy a token, then add as secret
   - `SHERLO_TOKEN`: Go to https://app.sherlo.io, create or select a project, navigate to Settings, copy the token, then add as secret

3. **Trigger the workflow:**
```bash
# Commit and push changes to main branch to trigger the workflow
git add .
git commit -m "Setup Sherlo"
git push origin main
```

4. **Review results:** Monitor the run in GitHub Actions tab and review results in Sherlo app at https://app.sherlo.io

### Locally

1. **Configure EAS:**
```bash
# Log in to EAS
npx eas-cli login

# Link project to your Expo account
npx eas-cli init
```

2. **Build the apps:**
```bash
# Build for Android
yarn build:android

# Build for iOS
yarn build:ios
```

3. **Run test:**
```bash
# Run Sherlo test with your project token
yarn sherlo:test --token [your Sherlo project token]
```
   
   **To get your token:** Go to https://app.sherlo.io, create or select a project, navigate to Settings, and copy the token. You can also add the token to `sherlo.config.json`. Learn more: https://sherlo.io/docs/config#token

4. **Review results:** View results in Sherlo app at https://app.sherlo.io

<br />

## 📁 Key Project Files

This example includes several important files configured for Sherlo integration:

- **[`App.tsx`](./App.tsx)** – Main component that renders Storybook for testing
- **[`.rnstorybook/index.ts`](./.rnstorybook/index.ts)** – Exports the Storybook component required by Sherlo ([setup docs](https://sherlo.io/docs/setup#storybook-component))
- **[`sherlo.config.json`](./sherlo.config.json)** – Configuration file with device settings, and optionally build paths or token
- **[`.github/workflows/standard.yml`](./.github/workflows/standard.yml)** – GitHub Actions workflow that automates the build and test process

<br />

## ℹ️ Additional Notes

- **Integrating Sherlo in your own project:** This example was set up using `npx sherlo init`, which automatically creates and configures the files listed above. To add Sherlo to your existing project, simply run this command in your project directory.

- **Build Alternatives:** This example uses EAS Build for app compilation. If you prefer other tools like React Native CLI or Native Build Tools (gradlew / xcodebuild), see our docs: https://sherlo.io/docs/builds?type=preview-simulator#build-types

<br />

## 🔗 Other Examples

- [../eas-update](../eas-update): Run visual tests using Over-The-Air updates for JavaScript changes, without full app rebuilds
- [../eas-cloud-build](../eas-cloud-build): Automatically run visual tests after builds complete on Expo servers