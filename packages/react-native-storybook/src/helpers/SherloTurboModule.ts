import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getConstants: () => {
    mode: string;
    config: string;
    lastState: string;
  };
  toggleStorybook(): Promise<void>;
  openStorybook(): Promise<void>;
  closeStorybook(): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  getInspectorData(): Promise<string>;
  stabilize(
    requiredMatches: number,
    intervalMs: number,
    timeoutMs: number,
    saveScreenshots: boolean
  ): Promise<boolean>;
}

// This is used for type checking in development only
export default TurboModuleRegistry.getEnforcing<Spec>('SherloModuleSpec');
