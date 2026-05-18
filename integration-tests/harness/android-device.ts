import {
  install as adbInstall,
  start as adbStart,
  forceStop as adbForceStop,
  type DeviceSerial,
} from './adb.js';
import {
  readFile as dfReadFile,
  writeFile as dfWriteFile,
  appendFile as dfAppendFile,
  deleteFile as dfDeleteFile,
} from './device-files.js';
import type { ProtocolFile } from './device-files.js';
import { startLogcatTailer } from './logcat.js';
import type { Device, LogTailer } from './device.js';

export class AndroidDevice implements Device {
  readonly platform = 'android' as const;
  readonly id: string;

  constructor(serial: DeviceSerial) {
    this.id = serial;
  }

  install(appPath: string, packageName: string): void {
    adbInstall(this.id, appPath, packageName);
  }

  start(packageName: string, activity = '.MainActivity'): void {
    adbStart(this.id, packageName, activity);
  }

  forceStop(packageName: string): void {
    adbForceStop(this.id, packageName);
  }

  readFile(packageName: string, file: ProtocolFile): string {
    return dfReadFile(this.id, packageName, file);
  }

  writeFile(packageName: string, file: ProtocolFile, contents: string): void {
    dfWriteFile(this.id, packageName, file, contents);
  }

  appendFile(packageName: string, file: ProtocolFile, contents: string): void {
    dfAppendFile(this.id, packageName, file, contents);
  }

  deleteFile(packageName: string, file: ProtocolFile): void {
    dfDeleteFile(this.id, packageName, file);
  }

  tailLog(opts?: { filter?: RegExp }): LogTailer {
    const tailer = startLogcatTailer({
      serial: this.id,
      filterPattern: opts?.filter?.source,
    });
    return {
      stop() { tailer.stop(); },
      snapshot() {
        return tailer.read().split('\n').filter(l => l.trim() !== '');
      },
    };
  }
}
