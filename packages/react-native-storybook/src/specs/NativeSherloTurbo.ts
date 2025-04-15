import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  hello(name: string): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SherloTurbo') as Spec | null;
