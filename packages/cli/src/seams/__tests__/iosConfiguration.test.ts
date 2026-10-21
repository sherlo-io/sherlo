import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { iosBuildConfiguration } from '../iosConfiguration';

let iosFolder: string;

beforeEach(() => {
  iosFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-ios-config-'));
  fs.mkdirSync(path.join(iosFolder, 'App.xcodeproj'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(iosFolder, { recursive: true, force: true });
});

function writeProject(names: string[]) {
  fs.writeFileSync(
    path.join(iosFolder, 'App.xcodeproj/project.pbxproj'),
    names.map((name) => `isa = XCBuildConfiguration;\n\t\t\tname = "${name}";\n`).join('')
  );
}

describe('the iOS build configuration chosen from the project files', () => {
  it('uses the configuration it is given before reading any file', () => {
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App', configuration: 'Staging' })).toBe(
      'Staging'
    );
  });

  it('finds a Release configuration whatever its case', () => {
    writeProject(['Debug', 'release']);
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('Release');
  });

  it("reads the archive configuration from a scheme in the workspace's shared schemes", () => {
    writeProject(['dev.debug', 'dev.release']);
    const schemes = path.join(iosFolder, 'App.xcworkspace/xcshareddata/xcschemes');
    fs.mkdirSync(schemes, { recursive: true });
    fs.writeFileSync(
      path.join(schemes, 'App.xcscheme'),
      '<ArchiveAction\n   buildConfiguration = "dev.release">'
    );
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('dev.release');
  });

  it('falls back to Release when the project and the scheme say nothing', () => {
    writeProject(['dev.debug']);
    expect(iosBuildConfiguration({ iosFolder, scheme: 'App' })).toBe('Release');
  });
});
