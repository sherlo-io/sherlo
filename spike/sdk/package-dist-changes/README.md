# The spike's changes to the SDK's compiled JS

The repository ignores every `dist/` folder, so the three files the spike changed in
`spike/sdk/package/dist/` are kept here too, at the same relative paths:

- `sealedCore.js` - new: asks native for the picked core, evaluates it, hands it out.
- `index.js` - loads the core at import, before anything else in the SDK runs.
- `getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness.js` - its
  `extractStoryId` decision now calls the sealed core instead of the SDK's own copy.

To rebuild the app's SDK, copy them back into `spike/sdk/package/dist/` and pack:
`tar --no-mac-metadata -czf examples/standard/sherlo-lib/react-native-storybook.tgz -C spike/sdk package`.
