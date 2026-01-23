# Standard Testing Example

Test your Storybook components with locally built apps. This is the simplest way to get started with Sherlo.

<br />

## ✨ What Makes This Example Special

- **Simple setup** - No external services required
- **Full control** - All builds stored on your machine
- **Works everywhere** - Local development and CI/CD ready

<br />

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────┐
│  1. Make UI changes in Storybook                    │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  2. Build Android + iOS simulator apps              │
│     🤖 android.apk  +  🍎 YourApp.app               │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  3. Run Sherlo tests                                │
│     npx sherlo test:standard                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  4. Review visual changes in Sherlo app             │
│     https://app.sherlo.io                           │
└─────────────────────────────────────────────────────┘
```

<br />

## ✅ Prerequisites

- Node.js 18 or higher
- Expo CLI or React Native CLI
- Sherlo account ([create one here](https://app.sherlo.io))

<br />

## 🚀 Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/sherlo-io/sherlo.git
cd sherlo/examples/standard

# Install dependencies
yarn install
```

### 2. Configure Sherlo

Get your project token from [app.sherlo.io](https://app.sherlo.io) and add it to `sherlo.config.json`:

```json
{
  "token": "YOUR_TOKEN_HERE",
  "android": "builds/android.apk",
  "ios": "builds/ios.app",
  "devices": [
    { "id": "iphone.15", "osVersion": "17" },
    { "id": "pixel.7", "osVersion": "13" }
  ]
}
```

### 3. Build Simulator Apps

Build both Android and iOS apps for simulators:

```bash
# Build Android
yarn build:android

# Build iOS
yarn build:ios
```

The builds will be saved to the `builds/` folder as specified in your config.

<br />

## 🧪 Running Tests

### Local Testing

```bash
yarn sherlo:test
```

This runs `npx sherlo test:standard` which uploads your builds and runs visual tests on all configured devices.

### CI/CD Testing (GitHub Actions)

This example includes a [`.github/workflows/sherlo.yml`](./.github/workflows/sherlo.yml) workflow file. To use it:

1. Add these secrets to your GitHub repository:
   - `SHERLO_TOKEN` - Your project token from Sherlo
   - `EXPO_TOKEN` - Your Expo access token (if using Expo)

2. Push to `main` branch or open a PR - tests run automatically

<br />

## 📁 Key Files

```
examples/standard/
├── .storybook/              # Storybook configuration
├── .github/workflows/       # CI/CD workflow for GitHub Actions
├── builds/                  # Build output directory (gitignored)
├── src/
│   └── components/          # Example components with stories
├── sherlo.config.json       # Sherlo testing configuration
└── package.json             # Scripts: build:android, build:ios, sherlo:test
```

**Important files:**
- `sherlo.config.json` - Defines test devices and build paths
- `.storybook/main.ts` - Storybook configuration for React Native
- `package.json` - Contains build and test scripts

<br />

## 💡 Key Points

- **New build required for every test** - Any code change (JS or native) needs a fresh build
- **Build paths must match config** - Ensure your build output matches paths in `sherlo.config.json`
- **Simulator builds only** - Use `.apk` for Android and `.app` for iOS (not production builds)

<br />

## 🔗 Learn More

- [Standard Testing Documentation](https://sherlo.io/docs/testing?method=standard)
- [Build Configuration Guide](https://sherlo.io/docs/builds?type=preview-simulator)
- [Sherlo Config Reference](https://sherlo.io/docs/config)
