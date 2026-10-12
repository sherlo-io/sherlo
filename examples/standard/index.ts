import { registerRootComponent } from 'expo';
import App from './App';
import { runSpike } from './spike/runSpike';

runSpike();

registerRootComponent(App);
