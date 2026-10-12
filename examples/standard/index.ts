import { registerRootComponent } from 'expo';
import App from './App';
import { runSpike } from './spike/bundleReload';

runSpike();

registerRootComponent(App);
