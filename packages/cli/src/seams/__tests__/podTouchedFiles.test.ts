/**
 * The files `pod install` writes (../podTouchedFiles): which are read, and which of them an
 * install changed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesTheInstallChanged, readPodTouchedFiles } from '../podTouchedFiles';

let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-pod-touched-'));
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

const lock = (cocoapods: string, pod = 'React (0.77.2)') =>
  Buffer.from(`PODS:\n  - ${pod}\n\nCOCOAPODS: ${cocoapods}\n`);

describe('reading the files pod install writes', () => {
  it('reads the Podfile.lock and each Xcode project file that is there', () => {
    fs.mkdirSync(path.join(projectRoot, 'ios/App.xcodeproj'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'ios/Podfile.lock'), 'PODS:\n');
    fs.writeFileSync(path.join(projectRoot, 'ios/App.xcodeproj/project.pbxproj'), '// pbx\n');
    fs.writeFileSync(path.join(projectRoot, 'ios/Podfile'), 'platform :ios\n');

    expect([...readPodTouchedFiles(projectRoot).keys()]).toEqual([
      'ios/Podfile.lock',
      'ios/App.xcodeproj/project.pbxproj',
    ]);
  });
});

describe('telling which files an install changed', () => {
  it('counts a lock that differs only in its COCOAPODS line as changed, but not in the app', () => {
    const result = filesTheInstallChanged({
      before: new Map([['ios/Podfile.lock', lock('1.15.2')]]),
      after: new Map([['ios/Podfile.lock', lock('1.17.0')]]),
    });

    expect(result).toEqual({ changed: ['ios/Podfile.lock'], changedInTheApp: [] });
  });

  it('counts a changed pod, a new lock and a changed project file as changed in the app', () => {
    const changedPod = filesTheInstallChanged({
      before: new Map([['ios/Podfile.lock', lock('1.15.2')]]),
      after: new Map([['ios/Podfile.lock', lock('1.15.2', 'React (0.77.3)')]]),
    });
    const newLock = filesTheInstallChanged({
      before: new Map(),
      after: new Map([['ios/Podfile.lock', lock('1.15.2')]]),
    });
    const project = filesTheInstallChanged({
      before: new Map([['ios/App.xcodeproj/project.pbxproj', Buffer.from('a')]]),
      after: new Map([['ios/App.xcodeproj/project.pbxproj', Buffer.from('b')]]),
    });

    expect(changedPod.changedInTheApp).toEqual(['ios/Podfile.lock']);
    expect(newLock.changedInTheApp).toEqual(['ios/Podfile.lock']);
    expect(project.changedInTheApp).toEqual(['ios/App.xcodeproj/project.pbxproj']);
  });

  it('answers nothing for an install that changed nothing', () => {
    const files = new Map([['ios/Podfile.lock', lock('1.15.2')]]);

    expect(filesTheInstallChanged({ before: files, after: new Map(files) })).toEqual({
      changed: [],
      changedInTheApp: [],
    });
  });
});
