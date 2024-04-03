# @sherlo/cli

`@sherlo/cli` is a vital component of the Visual Testing solution offered by Sherlo, tailored for automating the process
of uploading Android and iOS builds to Sherlo and initiating the testing procedure based on a specified configuration
file. This CLI tool is designed for both manual execution by developers and integration into Continuous Integration (CI)
setups. For GitHub Actions integration, please refer to `packages/sherlo-action`.

## Prerequisites

To utilize this CLI, ensure you have a `sherlo.config.ts` file in your project. The CLI will automatically detect this
configuration file if it's placed at the root of your project. If located elsewhere, the path to the configuration file
must be specified using the `--config <path>` argument.

## Installation and Usage

To run the CLI, use the following command:

```bash
npx @sherlo/cli
```

Upon execution, the CLI will upload your builds and commence testing, ultimately providing a URL to access the test
results.

## Configuration File (`sherlo.config.ts`)

Below is an example of a `sherlo.config.ts` file with explanations for each field:

```typescript
import { Config } from '@sherlo/react-native-storybook';

const config: Config = {
  token: 'XXXX', // Your Sherlo project token.
  exclude: ['screen'], // Exclude stories containing 'screen' in their names.
  include: ['base'], // Only include stories containing 'base' in their names.
  android: {
    path: 'builds/preview/android.apk', // Path to the Android APK file.
    packageName: 'com.sherlo.example', // Android package name.
    devices: [
      // Array of Android devices to test on.
      {
        id: 'galaxy.s23.ultra',
        osVersion: '12.0',
        theme: 'dark',
        locale: 'en_US',
      },
      {
        id: 'galaxy.tab.s9',
        osVersion: '12.0',
        theme: 'dark',
        locale: 'en_US',
      },
    ],
  },
  ios: {
    path: './builds/preview/ios.tar.gz', // Path to the iOS build file (.app or .tar.gz).
    bundleIdentifier: 'com.sherlo.example', // iOS bundle identifier.
    devices: [
      // Array of iOS devices to test on.
      {
        id: 'iphone.15.pro',
        osVersion: '16.4',
        theme: 'dark',
        locale: 'en_US',
      },
      {
        id: 'ipad.pro.12.9.2022',
        osVersion: '16.4',
        theme: 'dark',
        locale: 'en_US',
      },
    ],
  },
};

export default config;
```

### Config File Explained

- **token**: The token associated with your Sherlo project.
- **exclude**: An array of patterns to exclude specific stories from testing.
- **include**: An array of patterns to include specific stories for testing. If not provided, all stories are tested.
- **android** & **ios**: Configuration options for Android and iOS testing, respectively, including:
    - **path**: Location of the build file.
    - **packageName**/**bundleIdentifier**: Unique identifier for the app.
    - **devices**: A list of device configurations for testing.

For a comprehensive list of supported devices and their IDs,
visit [Sherlo Devices Documentation](https://docs.sherlo.io/getting-started/devices).
