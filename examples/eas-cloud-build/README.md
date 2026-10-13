# ☁️ EAS Cloud Build Example • Sherlo

A minimal example app showing Sherlo running automated [visual regression testing for React Native](https://sherlo.io). Sherlo captures Storybook stories on iOS and Android simulators in the cloud. `npx sherlo test` builds the iOS and Android apps with EAS, because this project turns it on.

- Sherlo integration
- GitHub Actions workflow

<br />

## 🔄 Workflow

`sherlo test` builds on **Expo servers** and runs the visual tests when the builds complete

```mermaid
flowchart TB
   UI(🧑‍💻 Code Changes)
   Test(🧪 sherlo test)
   subgraph Build[☁️ Build on Expo Servers]
      Android(🤖 Build Android)
      iOS(🍎 Build iOS)
      Android ~~~ iOS
      style Build fill:#4ba9ec1f,stroke:#4ba9ecd9
   end
   Review(👀 Review Results)

   UI --> Test
   Test --> Build
   Build --> Review
```

<br />

## 🛠️ Prerequisites

- [**Sherlo Account**](https://app.sherlo.io) – Required for visual testing
- [**Expo Account**](https://expo.dev/signup) – Required for EAS
- Node.js 18+

<br />

## ⚙️ Setup

### 1. Clone and Install

```bash
# Clone this example
npx degit https://github.com/sherlo-io/sherlo/examples/eas-cloud-build sherlo-eas-cloud-build

# Install dependencies
cd sherlo-eas-cloud-build
yarn install
```

### 2. Configure EAS (Expo)

Set up EAS to build your app binaries:

```bash
# Link project to your Expo account
npx eas-cli init
```

### 3. Log in to Sherlo

Log in once with `npx sherlo login`. In CI, the project token is passed as the `SHERLO_TOKEN` secret.

To get a project token:

1. Go to https://app.sherlo.io
2. Get your token:
   - **New project**: Create a project and copy the token
   - **Existing project**: Reset the token _(Settings → Reset token)_

### 4. EAS mode

This example turns EAS mode on, so `sherlo test` builds the apps on Expo's servers instead of on your computer:

- **[`sherlo.config.json`](./sherlo.config.json)** – `build.tool` is `"eas"` and `build.easProfile` names the profile to build
- **[`eas.json`](./eas.json)** – the `sherlo` profile builds a simulator app for iOS and an APK for Android, with `SHERLO_BUILD` set to `storybook`
- **[`package.json`](./package.json)** – the `eas-build-on-complete` and `eas-build-on-cancel` scripts, which Expo runs after each build
- **[`.gitignore`](./.gitignore)** – keeps `.sherlo/` out of git, while [`.easignore`](./.easignore) lets it into the upload

<br />

## 🚀 How to Run

### Option A: Run from Terminal

Run Sherlo to build on Expo servers and visually test the builds when they complete:

```bash
yarn sherlo
```

---

### Option B: GitHub Actions

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
   git commit -m "Run Sherlo test"
   git push -u origin main
   ```

   _💡 After pushing, view workflow progress in your repository's Actions tab_

<br />

## 👀 Review Results

Once your test completes, open [Sherlo app](https://app.sherlo.io):

- **First test** _(baseline)_ – Approve correct screenshots - they become your baseline for future comparisons
- **Next tests** _(comparison)_ – Review visual changes - confirm what’s expected or needs fixing

_💡 First test won't show "changes" since there's nothing to compare against yet_

<br />

## 📁 Key Files

- **[`App.tsx`](./App.tsx)** – Root component rendering Storybook for testing _([docs](https://sherlo.io/docs/setup#storybook-access))_
- **[`metro.config.js`](./metro.config.js)** – Metro config wrapped with Sherlo's `withStorybook` _([docs](https://sherlo.io/docs/setup#metro-config))_
- **[`sherlo.config.json`](./sherlo.config.json)** – Config file with testing devices _([docs](https://sherlo.io/docs/config))_
- **[`.github/workflows/eas-cloud-build.yml`](./.github/workflows/eas-cloud-build.yml)** – CI workflow for automated testing process
- **[`package.json`](./package.json)** – Dependencies and scripts for Sherlo integration

_💡 **Own project?** Run `npx sherlo init` to automatically integrate Sherlo in your codebase_

<br />

## 📚 Learn More

To learn more about **EAS Cloud Build** testing method, visit our [documentation](https://sherlo.io/docs/testing?method=eas-cloud-build#testing-methods)

<br />

## 🔗 Other Examples

- 📦 **[Standard](../standard)** – Build with Gradle and Xcode and test with the Sherlo GitHub Action
- ⚡ **[EAS Update](../eas-update)** – Test builds with OTA JavaScript updates - skip rebuilds
