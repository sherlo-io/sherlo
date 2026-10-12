import { requireNativeModule } from 'expo-modules-core';

type LaunchInfo = Record<string, string | number | null>;

type SpikeNetModule = {
  log(message: string): void;
  launchInfo(): LaunchInfo;
  markRestart(): void;
  open(kind: string, url: string): Promise<number>;
  echo(text: string): Promise<{ length: number; nativeMs: number }>;
  close(): void;
};

export default requireNativeModule<SpikeNetModule>('SpikeNet');
