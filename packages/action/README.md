# @sherlo/sherlo-action

`@sherlo/sherlo-action` is a GitHub Action provided by Sherlo as part of its Visual Testing solution. This action
facilitates the automation of uploading iOS & Android builds to Sherlo and initiating a test run directly from your
GitHub workflows. It streamlines the visual testing process by leveraging `sherlo.config.json` for configuration while
allowing overrides through GitHub Action inputs.

## Features

- **Automated Build Uploads**: Automatically uploads iOS and Android build files to Sherlo for testing.
- **Flexible Configuration**: Utilizes `sherlo.config.json` for test configuration, with the ability to override
  settings via action inputs.
- **Seamless Integration**: Designed to integrate seamlessly into CI/CD pipelines for continuous visual testing.

## Usage

To use `@sherlo/sherlo-action` in your GitHub workflow, follow these steps:

1. Ensure you have a `sherlo.config.json` file in your repository. This file dictates the configurations for your test
   runs.

2. Add a step in your `.github/workflows/<workflow>.yml` file that uses `@sherlo/sherlo-action`. You can specify paths
   to your Android and iOS builds, and optionally, a custom path to your `sherlo.config.json` file if it's not located
   at the root of your repository.

### Example Workflow

```yaml
name: Sherlo Visual Testing Workflow

on:
  push:
    branches: [ main ]

jobs:
  visual-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run Sherlo Visual Tests
        uses: sherlo/sherlo-action@v1.0.0
        with:
          android: './build/android/app-debug.apk'
          ios: './build/ios/app.tar.gz'
          config: './config/sherlo.config.json'
```

### Inputs

- `android`: The path to the Android build file (.apk). _Optional_
- `ios`: The path to the iOS simulator build file (.app directory or .tar.gz file). _Optional_
- `config`: The path to your `sherlo.config.json` file. This input is optional; if not provided, the action searches for
  the config file at the root of your repository.

## Configuration (`sherlo.config.json`)

Your `sherlo.config.json` file dictates the testing configurations, such as token, apps data and devices to test on.
Refer to [Sherlo Docs](https://docs.sherlo.io/getting-started/config) for detailed configuration options.
