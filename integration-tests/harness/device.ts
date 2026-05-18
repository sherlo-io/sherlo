import type { ProtocolFile } from './device-files.js';

export type { ProtocolFile };

export interface LogTailer {
  stop(): void;
  /** All accumulated filtered lines captured so far (one-shot snapshot). */
  snapshot(): string[];
}

export interface Device {
  /** Stable identifier - Android serial, iOS sim UDID. */
  readonly id: string;
  readonly platform: 'android' | 'ios';

  install(appPath: string, packageName: string): void;
  start(packageName: string, activity?: string): void;
  forceStop(packageName: string): void;

  readFile(packageName: string, file: ProtocolFile): string;
  writeFile(packageName: string, file: ProtocolFile, contents: string): void;
  appendFile(packageName: string, file: ProtocolFile, contents: string): void;
  deleteFile(packageName: string, file: ProtocolFile): void;

  tailLog(opts?: { filter?: RegExp }): LogTailer;
}
