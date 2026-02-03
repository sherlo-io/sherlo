# Sherlo Example - EAS Update

Minimal React Native + Storybook app with:

- Sherlo integration
- GitHub Actions workflow

<br />

## 🔄 Workflow

Run visual tests using **Over-The-Air updates** for JavaScript changes, without full app rebuilds

```mermaid
flowchart TB
   UI(🧑‍💻 Code Changes)
   Check{Native code changed?}
   Reuse(📦 Reuse Builds)
   subgraph Build[Build Apps]
      Android(🤖 Build Android)
      iOS(🍎 Build iOS)
      Android ~~~ iOS
   end
   Update(⚡ OTA Update)
   Sherlo(🧪 Run Sherlo)
   Review(👀 Review Results)

   UI --> Check
   Check -->|No| Reuse
   Check -->|Yes| Build
   Reuse & Build --> Update
   Update --> Sherlo
   Sherlo --> Review
```

Learn more about [EAS Update testing method](https://sherlo.io/docs/testing?method=eas-update#testing-methods) in our documentation

<br />

## 🛠️ Prerequisites

- [**Sherlo Account**](https://app.sherlo.io) – Required for visual testing
- [**Expo Account**](https://expo.dev/signup) – Required for EAS

<br />

## ⚙️ Setup

### 1. Clone and Install

```bash
# Clone this example
npx degit https://github.com/sherlo-io/sherlo/examples/eas-update sherlo-eas-update

# Install dependencies
cd sherlo-eas-update
yarn install
```

### 2. Configure EAS (Expo)

Set up EAS to build your app binaries and ship JavaScript updates

```bash
# Link project to your Expo account
npx eas-cli init

# Configure EAS Update for Over-The-Air updates
npx eas-cli update:configure
```

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
   # Link project to your GitHub repository
   git init
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   ```

2. **Add repository secrets**

   In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

   - `SHERLO_TOKEN` – Your Sherlo project token
   - `EXPO_TOKEN` – Your [Expo access token](https://expo.dev/accounts/[your-account]/settings/access-tokens)

3. **Trigger the workflow**

   Push to the `main` branch to trigger the automated testing process:

   ```bash
   git add .
   git commit -m "Run Sherlo tests"
   git push -u origin main
   ```

   _After pushing, view workflow progress in your repository's **Actions** tab._

---

### Option B: Run Locally

1. **Build apps** _(when native code changes)_

   Build development Android and iOS apps on your machine:

   ```bash
   yarn build:android
   yarn build:ios
   ```

   _💡 Build once and reuse for future test runs_

2. **Publish OTA update**

   Publish your JavaScript changes to EAS Update:

   ```bash
   yarn eas:update
   ```

3. **Run tests**

   Run Sherlo visual tests on the built apps with latest update:

   ```bash
   yarn sherlo --token YOUR_SHERLO_TOKEN
   # Or add token to sherlo.config.json and run: yarn sherlo
   ```

<br />

## 👀 Review Results

Once your tests complete, open [Sherlo app](https://app.sherlo.io) to review visual changes

<br />

## 📁 Key Files

- **[`App.tsx`](./App.tsx)** – Root component rendering Storybook for testing _([docs](https://sherlo.io/docs/setup#storybook-access))_
- **[`.rnstorybook/index.ts`](./.rnstorybook/index.ts)** – Storybook component modified for Sherlo integration _([docs](https://sherlo.io/docs/setup#storybook-component))_
- **[`sherlo.config.json`](./sherlo.config.json)** – Config file with testing devices _([docs](https://sherlo.io/docs/config))_
- **[`.github/workflows/eas-update.yml`](./.github/workflows/eas-update.yml)** – CI workflow for automated testing process
- **[`package.json`](./package.json)** – Dependencies and scripts for Sherlo integration

_**Own project?** Run `npx sherlo init` to automatically integrate Sherlo in your codebase_

<br />

## 📚 Learn More

For detailed information about **EAS Update** testing method, visit our [documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods)

<br />

## 📚 Learn More

To learn more about **EAS Update** testing method, visit our [documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods)

<br />

## 📖 Documentation

For detailed information about **EAS Update testing method**, visit our [documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods).

<br />

## 📖 Documentation

Learn more about **[EAS Update](https://sherlo.io/docs/testing?method=eas-update#testing-methods)** testing method in our documentation

<br />

## 📖 Documentation

For detailed information, see **[EAS Update](https://sherlo.io/docs/testing?method=eas-update#testing-methods)** testing method

<br />

## 📖 Testing Method

For detailed information visit our [documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods)

<br />

## 📚 Learn More

**[EAS Update Testing Method →](https://sherlo.io/docs/testing?method=eas-update#testing-methods)**

<br />

## 💡 About This Method

This example uses EAS Update testing. **[Read full documentation →](https://sherlo.io/docs/testing?method=eas-update#testing-methods)**

<br />

## 📖 Want to Learn More?

Explore the **[EAS Update testing method](https://sherlo.io/docs/testing?method=eas-update#testing-methods)** in detail.

<br />

## 🔗 Resources

**[EAS Update Testing Documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods)**

<br />

## ℹ️ Testing Method

This example demonstrates EAS Update testing – learn more in our **[documentation](https://sherlo.io/docs/testing?method=eas-update#testing-methods)**.

<br />

## 📖 Docs

**[EAS Update Testing →](https://sherlo.io/docs/testing?method=eas-update#testing-methods)**

<br />

## 🔗 Other Examples

- **[Standard](../standard)** – Run visual tests on app builds **with bundled JavaScript code**
- **[EAS Cloud Build](../eas-cloud-build)** – Automatically run visual tests **after builds complete on Expo servers**
