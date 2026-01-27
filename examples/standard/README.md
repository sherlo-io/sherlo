# Standard Example

Minimal React Native + Storybook setup with GitHub Actions workflow.

Run visual tests on app builds **with bundled JavaScript code**.

<br />

## 🔄 Workflow

```mermaid
flowchart TB
   UI(🧑‍💻 UI Changes)
   Android(🤖 Build Android)
   iOS(🍎 Build iOS)
   Sherlo(🧪 Run Sherlo)
   Review(👀 Review Changes)

   UI --> Android & iOS
   Android & iOS --> Sherlo
   Sherlo --> Review
```

<br />

## 🛠️ Prerequisites

- **Sherlo Account** – required for visual testing ([create account](https://app.sherlo.io))
- **Expo Account** – required for EAS Build ([create account](https://expo.dev/signup))

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

### 1) Configure EAS

```bash
# Log in to EAS
npx eas-cli login

# Link project to your Expo account
npx eas-cli init
```

🛠️ **Build Method:** This example uses EAS Build. For other build tools, see [documentation](https://sherlo.io/docs/builds?type=preview-simulator#build-types).

<br />

### 2) Choose your workflow

#### A) GitHub Actions ([`.github/workflows/standard.yml`](./.github/workflows/standard.yml))

<!-- 1. **Add secrets** (Settings → Secrets and variables → Actions -> New repository secret):
   - `EXPO_TOKEN` – [create here](https://expo.dev/accounts/[your-account]/settings/access-tokens)
   - `SHERLO_TOKEN` – from [Sherlo](https://app.sherlo.io) (Project → Settings)

2. **Trigger:** Commit and push to `main` branch -->

1. **Add secrets** (Settings → Secrets and variables → Actions -> New repository secret)
   - `EXPO_TOKEN` – [create here](https://expo.dev/accounts/[your-account]/settings/access-tokens)
   - `SHERLO_TOKEN` – from [Sherlo](https://app.sherlo.io) (Project → Settings)

2. **Trigger the workflow**

```bash
# Commit and push changes to main branch to trigger the workflow (build + test)
git add .
git commit -m "First Sherlo Test"
git push origin main
```

#### B) Local

<!-- 1. **Build:** Run `yarn build:android` and `yarn build:ios`

2. **Test:** Run `yarn sherlo:test --token [SHERLO_TOKEN]`
   - Get token from [Sherlo](https://app.sherlo.io) (Project → Settings)
   - Or add it to `sherlo.config.json` ([docs](https://sherlo.io/docs/config#token)) -->

1. **Build apps**

```bash
# Build Android
yarn build:android

# Build iOS
yarn build:ios
```

2. **Run test**

```bash
# Run Sherlo test with your project token
yarn sherlo:test --token [SHERLO_TOKEN]
```

<br />

### 3) Review results

Review detected visual changes at https://app.sherlo.io.

<br />

## 📁 Key Files

- **[`App.tsx`](./App.tsx)** – Root component rendering Storybook for testing ([docs](https://sherlo.io/docs/setup#storybook-access))
- **[`.rnstorybook/index.ts`](./.rnstorybook/index.ts)** – Modified Storybook component required by Sherlo ([docs](https://sherlo.io/docs/setup#storybook-component))
- **[`sherlo.config.json`](./sherlo.config.json)** – Config file with testing devices ([docs](https://sherlo.io/docs/config))
- **[`.github/workflows/standard.yml`](./.github/workflows/standard.yml)** – CI workflow for automated builds and tests

💡 **Own project?** Run `npx sherlo init` to automatically integrate Sherlo in your project.

<br />

## 🔗 Other Examples

- **[EAS Update](../eas-update)** – Run visual tests using **Over-The-Air updates** for JavaScript changes, without full app rebuilds
- **[EAS Cloud Build](../eas-cloud-build)** – Automatically run visual tests **after builds complete on Expo servers**
