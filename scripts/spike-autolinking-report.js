// SPIKE (debug-only-native), not for merge: prints what each autolinking path (bare React Native
// CLI, Expo's react-native-config) says about Sherlo's native module, with SHERLO_IN_RELEASE unset
// and set to 1.
const { execFileSync } = require('child_process');
const path = require('path');

const TESTING_DIR = path.join(__dirname, '..', 'testing');
const SDK_NAME = '@sherlo/react-native-storybook';

function readAutolinkingConfig({ appDir, command, isSherloInRelease }) {
  const env = { ...process.env };
  if (isSherloInRelease) env.SHERLO_IN_RELEASE = '1';
  else delete env.SHERLO_IN_RELEASE;
  const output = execFileSync('node', command, {
    cwd: path.join(TESTING_DIR, appDir),
    env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output.toString()).dependencies[SDK_NAME].platforms;
}

const paths = [
  { name: 'bare', appDir: 'react-native', commands: { android: ['node_modules/@react-native-community/cli/build/bin.js', 'config'], ios: ['node_modules/@react-native-community/cli/build/bin.js', 'config'] } },
  { name: 'expo', appDir: 'expo', commands: {
    android: ['node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js', 'react-native-config', '--json', '--platform', 'android'],
    ios: ['node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js', 'react-native-config', '--json', '--platform', 'ios'],
  } },
];

for (const { name, appDir, commands } of paths) {
  for (const isSherloInRelease of [false, true]) {
    const android = readAutolinkingConfig({ appDir, command: commands.android, isSherloInRelease }).android;
    const ios = readAutolinkingConfig({ appDir, command: commands.ios, isSherloInRelease }).ios;
    console.log(
      `${name} SHERLO_IN_RELEASE=${isSherloInRelease ? '1' : 'unset'}: android.buildTypes=${JSON.stringify(android.buildTypes)} ios.configurations=${JSON.stringify(ios.configurations)}`
    );
  }
}
