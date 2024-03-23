# @sherlo/expo-example

`@sherlo/expo-example` is a demonstration package showcasing the integration of the Sherlo Visual Testing solution within Expo projects. This package includes a fully configured example of `@sherlo/react-native-storybook`, demonstrating how to leverage Sherlo for visual testing in React Native applications developed with Expo.

## Features

- **Fully Configured Example**: Includes configured `App.tsx` and `.storybook/index.tsx` to demonstrate integration with Sherlo's Visual Testing solution.
- **Ease of Use**: Designed to be straightforward for developers new to Sherlo, illustrating step-by-step integration in an Expo project.

## Getting Started

To use the `@sherlo/expo-example` package in your project, follow these steps:

1. **Clone the Example**: Clone this repository to your local machine to get started with the example project.

   ```bash
   git clone https://github.com/sherlo-io/sherlo.git
   ```

2. **Install Dependencies**: Navigate to the root of the monorepo and install all necessary dependencies by running:

   ```bash
   yarn install
   ```

3. **Build Dependencies**: Ensure all dependencies are correctly built by executing:

   ```bash
   yarn build
   ```

4. **Configure Project Token**: Obtain a valid `token` by signing up for early access at [Sherlo](https://sherlo.io). Replace the placeholder token in `sherlo.config.ts` with your actual project token.

5. **Customize Configuration**: You can modify `sherlo.config.ts` to fit the specific needs of your project. Refer to `@sherlo/cli` documentation for detailed configuration options.

6. **Run Visual Testing**: Navigate to the `example/expo-example` directory and initiate the testing process with:

   ```bash
   npx @sherlo/cli
   ```

7. **GitHub Action Integration**: For automated builds and testing, consider using `@sherlo/sherlo-action` in your GitHub workflows.

8. **React Native Code Changes**: If you make changes to the React Native code, rebuild the app with the following commands before running visual tests:

   ```bash
   yarn android:build:preview
   yarn ios:build:preview
   ```

   These builds are then uploaded and tested via `npx @sherlo/cli` command.

## Configuration Overview

- `App.tsx`: Integrates `withStorybook` to toggle between the app and Storybook based on Sherlo's testing environment or manual toggling.
- `.storybook/index.tsx`: Configures Storybook with `withSherlo` for development or testing modes, enabling control over the testing process.
- `sherlo.config.ts`: Defines testing parameters, including project token, devices, and stories to include or exclude.
