// SPIKE (launch-time-entry): Expo Router app (main: expo-router/entry) on Storybook's new setup,
// with Sherlo's Metro wrapper read from this repository's source.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('../../packages/react-native-storybook/metro/withStorybook');

const spikeEnvPath = path.join(__dirname, 'spike-env.json');
if (fs.existsSync(spikeEnvPath)) {
  Object.assign(process.env, JSON.parse(fs.readFileSync(spikeEnvPath, 'utf8')));
}

const config = getDefaultConfig(__dirname);
// The spike's copy sits under brain's .worktrees, which brain's .watchmanconfig ignores.
config.resolver.useWatchman = false;

module.exports = withStorybook(config);
