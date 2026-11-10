import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installedPodsAreCurrent, podsLinkSherloInto } from '../installedPods';

let iosFolder: string;

function writeFile(relativePath: string, content: string) {
  const filePath = path.join(iosFolder, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

beforeEach(() => {
  iosFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-pods-'));
});

afterEach(() => {
  fs.rmSync(iosFolder, { recursive: true, force: true });
});

describe('whether pods link Sherlo into a configuration', () => {
  it('reads the configuration named in any case, and finds the pod with a dash or an underscore', () => {
    writeFile(
      'Pods/Target Support Files/Pods-App/Pods-App.dev.release.xcconfig',
      'OTHER_LDFLAGS = -framework "sherlo_react_native_storybook"\n'
    );
    writeFile(
      'Pods/Target Support Files/Pods-App/Pods-App.debug.xcconfig',
      'OTHER_LDFLAGS = -l"other"\n'
    );

    expect(podsLinkSherloInto(iosFolder, 'DEV.RELEASE')).toBe(true);
    expect(podsLinkSherloInto(iosFolder, 'Debug')).toBe(false);
    expect(podsLinkSherloInto(iosFolder, 'Staging')).toBe(false);
  });

  it('is false when the pods are not installed', () => {
    expect(podsLinkSherloInto(iosFolder, 'Release')).toBe(false);
  });
});

describe('whether installed pods are current and link Sherlo', () => {
  it('needs the manifest to equal the lockfile, and Sherlo linked into every configuration asked', () => {
    const support = 'Pods/Target Support Files/Pods-App/Pods-App';
    writeFile('Podfile.lock', 'PODS: one\n');
    writeFile('Pods/Manifest.lock', 'PODS: one\n');
    writeFile(`${support}.release.xcconfig`, '-l"sherlo-react-native-storybook"');
    writeFile(`${support}.debug.xcconfig`, '-l"other"');

    expect(installedPodsAreCurrent(iosFolder)).toBe(true);
    expect(installedPodsAreCurrent(iosFolder, ['Release'])).toBe(true);
    expect(installedPodsAreCurrent(iosFolder, ['Release', 'Debug'])).toBe(false);

    writeFile('Pods/Manifest.lock', 'PODS: two\n');
    expect(installedPodsAreCurrent(iosFolder)).toBe(false);
  });
});
