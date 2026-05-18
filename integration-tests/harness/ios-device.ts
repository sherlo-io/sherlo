import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Device, LogTailer } from './device.js';
import type { ProtocolFile } from './device-files.js';

const SHELL_TIMEOUT = 60_000;
const INSTALL_TIMEOUT = 180_000;

function shell(cmd: string, timeout = SHELL_TIMEOUT): string {
  return execSync(cmd, { encoding: 'utf8', timeout }).trim();
}

export class IosSimulator implements Device {
  readonly platform = 'ios' as const;

  constructor(public readonly id: string) {}

  install(appPath: string, packageName: string): void {
    // Uninstall so simctl wipes the app data container (Documents/sherlo/).
    // Without this, a previous test's config.sherlo / log.sherlo / protocol.sherlo
    // survive across installs and pollute the next test.
    try {
      shell(`xcrun simctl uninstall "${this.id}" "${packageName}"`, 30_000);
    } catch {
      // not installed - fine
    }
    shell(`xcrun simctl install "${this.id}" "${appPath}"`, INSTALL_TIMEOUT);
  }

  start(packageName: string, _activity?: string): void {
    shell(`xcrun simctl launch "${this.id}" "${packageName}"`);
  }

  forceStop(packageName: string): void {
    try {
      shell(`xcrun simctl terminate "${this.id}" "${packageName}"`);
    } catch {
      // not running - fine
    }
  }

  private container(packageName: string): string {
    return shell(`xcrun simctl get_app_container "${this.id}" "${packageName}" data`);
  }

  private filePath(packageName: string, file: ProtocolFile): string {
    const dir = path.join(this.container(packageName), 'Documents', 'sherlo');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, file);
  }

  readFile(packageName: string, file: ProtocolFile): string {
    const p = this.filePath(packageName, file);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
  }

  writeFile(packageName: string, file: ProtocolFile, contents: string): void {
    fs.writeFileSync(this.filePath(packageName, file), contents, 'utf8');
  }

  appendFile(packageName: string, file: ProtocolFile, contents: string): void {
    fs.appendFileSync(this.filePath(packageName, file), contents, 'utf8');
  }

  deleteFile(packageName: string, file: ProtocolFile): void {
    const p = this.filePath(packageName, file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  tailLog(opts?: { filter?: RegExp }): LogTailer {
    const udid = this.id;
    const launchTime = isoToSimctlLogTimestamp(new Date().toISOString());
    let stopped = false;
    return {
      stop() { stopped = true; },
      snapshot(): string[] {
        if (stopped) return [];
        let raw = '';
        try {
          // No predicate - capture all simulator logs so both React Native JS output
          // (subsystem com.facebook.react.log) and iOS native module messages
          // (e.g. "[SherloModule] Running in storybook mode") are included.
          // Caller's opts.filter handles any further in-memory narrowing.
          // maxBuffer raised to 20 MB: app install + boot generates ~1 MB/37 s of
          // unified-log output, which overflows the 1 MB default.
          raw = execSync(
            `xcrun simctl spawn "${udid}" log show --start "${launchTime}" --info --style compact 2>/dev/null`,
            { encoding: 'utf8', timeout: 30_000, maxBuffer: 20 * 1024 * 1024 },
          );
        } catch {
          return [];
        }
        const lines = raw.split('\n').filter(l => l.length > 0);
        return opts?.filter ? lines.filter(l => opts.filter!.test(l)) : lines;
      },
    };
  }
}

function isoToSimctlLogTimestamp(iso: string): string {
  // log show expects "YYYY-MM-DD HH:MM:SS+ZZZZ"
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`
  );
}
