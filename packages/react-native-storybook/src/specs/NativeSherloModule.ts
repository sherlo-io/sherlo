import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getInspectorData: () => Promise<string>;
  sendNativeError: (errorCode: string, message: string, dataJson: string) => void;
  reportEarlyJsError: (name: string, message: string, stack: string) => boolean;
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
  isScrollable: () => Promise<{
    scrollable: boolean;
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
  }>;
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
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
  }>;
  getSherloConstants: () => {};
}

let SherloModule: Spec | null = null;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec;
  console.warn(`[SherloModule diag] TurboModuleRegistry.getEnforcing OK, module=${SherloModule === null ? 'NULL' : 'OK'}, type=${(SherloModule as any)?.constructor?.name}`);
} catch (e) {
  console.warn(`[SherloModule diag] TurboModuleRegistry.getEnforcing THREW: ${e}`);
}

export default SherloModule;
