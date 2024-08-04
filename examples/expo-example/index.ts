import { AppRegistry } from 'react-native';

import { registerRootComponent } from 'expo';

import App from './App';
import Storybook from './.storybook';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
AppRegistry.registerComponent('Storybook', () => Storybook);
