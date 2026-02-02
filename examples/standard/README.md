# Sherlo Example - Standard

<!-- Minimal React Native + Storybook app -->

Run visual tests on app builds **with bundled JavaScript code**

```mermaid
flowchart TB
   UI(🧑‍💻 Code Changes)
   subgraph Build[Build Apps]
      Android(🤖 Build Android)
      iOS(🍎 Build iOS)
      Android ~~~ iOS
   end
   Sherlo(🧪 Run Sherlo)
   Review(👀 Review Results)

   UI --> Build
   Build --> Sherlo
   Sherlo --> Review
```

<br />

## 🛠️ Prerequisites

- [**Sherlo Account**](https://app.sherlo.io) – Required for visual testing
- [**Expo Account**](https://expo.dev/signup) – Required for EAS Build

<br />

## ⚙️ Setup

### 1. Clone and Install

```bash
# Clone this example
npx degit https://github.com/sherlo-io/sherlo/examples/standard sherlo-standard

# Install dependencies
cd sherlo-standard
yarn install
```

### 2. Configure EAS (Expo)

Set up EAS to build your app binaries

```bash
# Link project to your Expo account
npx eas-cli login
npx eas-cli init
```

<!-- Set up EAS to build your app binaries and ship JavaScript updates -->

<!-- ```bash
# Link project to your Expo account
npx eas-cli login
npx eas-cli init

# Configure EAS Update for Over-The-Air updates
npx eas-cli update:configure
``` -->

_This example uses EAS Build; for other build tools, see our [documentation](https://sherlo.io/docs/builds?type=preview-simulator#build-types)_

### 3. Get Sherlo Token

This token authenticates your account and links test runs to your project

1. Go to https://app.sherlo.io
2. Get your token:
   - **New project**: Create a project and copy the token
   - **Existing project**: Reset the token _(Settings → Reset token)_

<br />

## 🚀 How to Run

### Option A: GitHub Actions _(Recommended)_

1. **Create GitHub repository**

   Set up an [empty GitHub repository](https://github.com/new) _(no README or other files)_ and connect it to your project:
   
   ```bash
   # Initialize Git and link your project to your GitHub repository
   git init
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   ```

2. **Add repository secrets**
   
   In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `SHERLO_TOKEN` – Your Sherlo project token
   - `EXPO_TOKEN` – Your [Expo access token](https://expo.dev/accounts/[your-account]/settings/access-tokens)

3. **Trigger the workflow**

   <!-- Push to the `main` branch to trigger the workflow: -->

   Push to the `main` branch to trigger the automated build and testing process:
   
   ```bash
   git add .
   git commit -m "Run Sherlo tests"
   git push -u origin main
   ```

   _After pushing, view workflow progress in your repository's **Actions** tab._

   <!-- _After pushing, builds run on Expo servers. Tests start automatically when builds complete._ -->
   <!-- _After pushing, builds are triggered on Expo servers and tests run automatically._ -->
   <!-- _After pushing, track build progress in [Expo dashboard](https://expo.dev). Tests run automatically when builds complete._ -->
   <!-- After pushing, track build progress in your Expo dashboard. Tests will run automatically once builds complete. -->
   <!-- _After pushing, monitor build progress in your [Expo dashboard](https://expo.dev). Tests run automatically when builds complete._ -->

---

### Option B: Run Locally

1. **Build apps**

   Build Android and iOS apps on your machine:

   ```bash
   yarn build:android
   yarn build:ios
   ```

2. **Run tests**

   Run Sherlo visual tests on the built apps:

   ```bash
   yarn sherlo --token YOUR_SHERLO_TOKEN
   # Or add token to sherlo.config.json and run: `yarn sherlo`
   ```

<br />

## 👀 Review Results

Once your tests complete, open [Sherlo app](https://app.sherlo.io) to review visual changes

<br />

## 📁 Key Files

- **[`App.tsx`](./App.tsx)** – Root component rendering Storybook for testing _([docs](https://sherlo.io/docs/setup#storybook-access))_
- **[`.rnstorybook/index.ts`](./.rnstorybook/index.ts)** – Storybook component modified for Sherlo integration _([docs](https://sherlo.io/docs/setup#storybook-component))_
- **[`sherlo.config.json`](./sherlo.config.json)** – Config file with testing devices _([docs](https://sherlo.io/docs/config))_
- **[`.github/workflows/standard.yml`](./.github/workflows/standard.yml)** – CI workflow for automated builds and tests

_**Own project?** Run `npx sherlo init` to automatically integrate Sherlo in your codebase_

<br />

## 🔗 Other Examples

- **[EAS Update](../eas-update)** – Run visual tests using **Over-The-Air updates** for JavaScript changes, without full app rebuilds
- **[EAS Cloud Build](../eas-cloud-build)** – Automatically run visual tests **after builds complete on Expo servers**
