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
    saveScreenshots: boolean,
    threshold: number,
    includeAA: boolean
  ) => Promise<boolean>;
  isScrollableSnapshot: () => Promise<boolean>;
  scrollToCheckpoint: (
    index: number,
    offset: number,
    maxIndex: number
  ) => Promise<{
    reachedBottom: boolean;
    appliedIndex: number;
    appliedOffsetPx: number;
    viewportPx: number;
    contentPx: number;
  }>;
  getSherloConstants: () => {};
}

let SherloModule: Spec | null = null;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec;
} catch (e) {
  // Ignore if module is not found
}

export default SherloModule;
