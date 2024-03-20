# Sherlo Monorepo

Welcome to the Sherlo Monorepo, your comprehensive solution for integrating visual testing into your React Native projects. Sherlo streamlines the visual testing process, offering seamless integration with Storybook for React Native, automation through a CLI tool, and GitHub Actions for CI/CD pipelines.

## Quick Guide

To integrate Sherlo with your React Native app and run tests via CLI or GitHub Actions, ensure you follow these steps:

### Prerequisites

- Ensure you have **Storybook for React Native** configured in your project. Sherlo requires Storybook version `>=7.6.15`. Sherlo integrates with Storybook but does not operate independently.

### Step 1: Integrate with Storybook

1. **Install `@sherlo/react-native-storybook`** to enable Sherlo's visual testing with Storybook in your React Native application.

   ```bash
   yarn add @sherlo/react-native-storybook @react-native-async-storage/async-storage
   ```

2. **Wrap Your Application with `withStorybook`** to toggle between your app and Storybook based on Sherlo's testing environment.

   ```tsx
   // App.tsx
   import { withStorybook } from '@sherlo/react-native-storybook';
   import StorybookUIRoot from './.storybook';

   export default withStorybook(AppRoot, StorybookUIRoot);
   ```

3. **Configure Storybook with `withSherlo`** for development or testing modes, enabling control over the testing process.

   ```tsx
   // .storybook/index.tsx
   import { withSherlo } from '@sherlo/react-native-storybook';
   import StorybookUI from './storybook';

   export default withSherlo(StorybookUI, {
     /* Configuration options */
   });
   ```

### Step 2: Configure `sherlo.config.ts`

1. **Obtain a Project Token** by signing up for early access at [Sherlo.io](https://sherlo.io).

2. **Set Up Your Configuration File**, specifying your project token, devices, and app information.

   ```typescript
   // sherlo.config.ts
   import { Config } from '@sherlo/react-native-storybook';

   const config: Config = {
     projectToken: 'your_project_token_here',
     android: {
       path: 'path/to/android/app.apk',
       packageName: 'com.yourapp.package',
       devices: [
         /* Your Android Devices Here */
       ],
     },
     ios: {
       path: 'path/to/ios/app.tar.gz',
       bundleIdentifier: 'your.ios.bundle.identifier',
       devices: [
         /* Your iOS Devices Here */
       ],
     },
   };

   export default config;
   ```

### Step 3: Running Tests

- **Manually with CLI**: Install `@sherlo/cli` and run it in your project directory to upload builds and start tests.

  ```bash
  yarn global add @sherlo/cli
  npx @sherlo/cli
  ```

- **Automate with GitHub Actions**: Use `@sherlo/sherlo-action` in your `.github/workflows` to automate the testing process in your CI/CD pipeline.

### Packages

- **[@sherlo/react-native-storybook](packages/react-native-storybook/README.md)**: Integrate Storybook with Sherlo for React Native apps.
- **[@sherlo/cli](packages/cli/README.md)**: CLI tool for uploading builds and initiating tests.
- **[@sherlo/action](packages/cli/README.md)**: GitHub Action for automating visual testing workflows.

### Example

- **[@sherlo/expo-example](example/expo-example/README.md)**: Fully configured example showcasing integration in an Expo project.

### Contribution

Contributions are welcome! Please fork the repository, make your changes, and submit a pull request. For major changes, open an issue first to discuss what you would like to change.

### License

Sherlo is released under the MIT License. See the LICENSE file in each package for more details.
