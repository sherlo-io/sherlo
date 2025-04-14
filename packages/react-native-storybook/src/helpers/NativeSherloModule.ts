import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Constants
  getConstants: () => {
    mode: string;
    config: string;
    lastState: string;
  };

  // Storybook control methods
  toggleStorybook(): Promise<void>;
  openStorybook(): Promise<void>;
  closeStorybook(): Promise<void>;

  // File system methods
  appendFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;

  // Inspector and stability methods
  getInspectorData(): Promise<string>;
  stabilize(requiredMatches: number, intervalMs: number, timeoutMs: number): Promise<boolean>;
}

// This is used for type checking in development only
export default TurboModuleRegistry.getEnforcing<Spec>('SherloModuleSpec');
