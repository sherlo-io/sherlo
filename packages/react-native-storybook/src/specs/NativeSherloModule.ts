import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getInspectorData: () => Promise<string>;
  appendFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => void;
  closeStorybook: () => void;
  toggleStorybook: () => void;
  stabilize: (
    requiredMatches: number,
    minScreenshotsCount: number,
    intervalMs: number,
    timeoutMs: number,
    saveScreenshots: boolean
  ) => Promise<boolean>;
  getSherloConstants: () => {};
}

let SherloModule;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec | null;
} catch (e) {
  // Ignore if module is not found
}

export default SherloModule;
