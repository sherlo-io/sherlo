/**
 * THE FILES `pod install` WRITES, read before and after it runs, and which of them it changed.
 * Used by the app builder seam's iOS compile (./appBuilder).
 */
import fs from 'fs';
import path from 'path';
import { stripCocoapodsLine } from '../helpers/fingerprint/baseFingerprint';

/** The files `pod install` writes, by path from the project root, with the bytes each holds. */
export function readPodTouchedFiles(projectRoot: string): Map<string, Buffer> {
  const iosFolder = path.join(projectRoot, 'ios');
  const files = ['ios/Podfile.lock'];
  if (fs.existsSync(iosFolder)) {
    for (const name of fs.readdirSync(iosFolder)) {
      if (name.endsWith('.xcodeproj')) files.push(`ios/${name}/project.pbxproj`);
    }
  }
  const contents = new Map<string, Buffer>();
  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) contents.set(file, fs.readFileSync(filePath));
  }
  return contents;
}

/**
 * The files whose bytes differ between the two reads (`changed`), and those of them that differ in
 * more than a Podfile.lock's COCOAPODS line (`changedInTheApp`): that line names the CocoaPods that
 * wrote the lock, and is no part of the base fingerprint.
 */
export function filesTheInstallChanged({
  before,
  after,
}: {
  before: Map<string, Buffer>;
  after: Map<string, Buffer>;
}): { changed: string[]; changedInTheApp: string[] } {
  const empty = Buffer.alloc(0);
  const changed = [...after.keys()].filter(
    (file) => !after.get(file)!.equals(before.get(file) ?? empty)
  );
  const textOf = (file: string, bytes: Buffer | undefined) =>
    file.endsWith('Podfile.lock') ? stripCocoapodsLine((bytes ?? empty).toString()) : '';
  const changedInTheApp = changed.filter(
    (file) =>
      !file.endsWith('Podfile.lock') ||
      textOf(file, before.get(file)) !== textOf(file, after.get(file))
  );
  return { changed, changedInTheApp };
}

/** CocoaPods' own "in sync" test: the installed pods' manifest equals the lockfile, byte for byte. */
export function podsAreCurrent(iosFolder: string): boolean {
  const lockfile = path.join(iosFolder, 'Podfile.lock');
  const manifest = path.join(iosFolder, 'Pods/Manifest.lock');
  return (
    fs.existsSync(lockfile) &&
    fs.existsSync(manifest) &&
    fs.readFileSync(lockfile).equals(fs.readFileSync(manifest))
  );
}

/**
 * What a failed pod step prints: its command and exit code (when the failure carries one), then the
 * first error line of its log.
 */
export function podInstallFailureLines(params: {
  command: string;
  exitCode?: number;
  logLines: string[];
}): string[] {
  const { command, exitCode, logLines } = params;
  const lines = logLines.filter((line) => line.trim() !== '');
  const firstError = lines.find((line) => /error|mismatch|fail|\[!\]/i.test(line)) ?? lines[0];
  return [
    `The pod install step failed: \`${command}\`${
      exitCode === undefined ? '' : ` exited with ${exitCode}`
    }.`,
    ...(firstError ? [firstError.trim()] : []),
  ];
}
