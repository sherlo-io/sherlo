import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getInspectorData: () => Promise<string>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => void;
  closeStorybook: () => void;
  toggleStorybook: () => void;
  stabilize: (
    requiredMatches: number,
    intervalMs: number,
    timeoutMs: number,
    saveScreenshots: boolean
  ) => Promise<boolean>;
  getSherloConstants: () => {};
}

export default TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec | null;
