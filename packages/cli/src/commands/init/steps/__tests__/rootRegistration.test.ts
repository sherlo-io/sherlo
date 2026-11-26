import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const projectRoot = vi.hoisted(() => ({ path: '' }));
vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));

import rootRegistration from '../rootRegistration';

const MAIN_ACTIVITY = 'android/app/src/main/java/com/acmeshop/MainActivity';

function appWith(files: Record<string, string>): void {
  projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'root-registration-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(projectRoot.path, name)), { recursive: true });
    fs.writeFileSync(path.join(projectRoot.path, name), content);
  }
}

afterEach(() => {
  fs.rmSync(projectRoot.path, { recursive: true, force: true });
});

describe('the root is registered under the name the native code opens', () => {
  it('an app with no native folders, whose native projects Expo makes at build, registers main', () => {
    appWith({ 'app.json': JSON.stringify({ expo: { name: 'Acme Shop' } }) });
    expect(rootRegistration()).toEqual({ registers: 'main' });
  });

  it('native code that opens "main" registers main', () => {
    appWith({
      [`${MAIN_ACTIVITY}.kt`]: 'override fun getMainComponentName(): String = "main"\n',
    });
    expect(rootRegistration()).toEqual({ registers: 'main' });
  });

  it("a Kotlin MainActivity opening app.json's name is registered by app.json's name", () => {
    appWith({
      'app.json': JSON.stringify({ name: 'Rn081' }),
      [`${MAIN_ACTIVITY}.kt`]: 'override fun getMainComponentName(): String = "Rn081"\n',
    });
    expect(rootRegistration()).toEqual({ registers: 'named', name: 'Rn081', inAppJson: true });
  });

  it('a Java MainActivity opening a name app.json does not hold is registered by that name', () => {
    appWith({
      'app.json': JSON.stringify({ name: 'AcmeShop' }),
      [`${MAIN_ACTIVITY}.java`]:
        'protected String getMainComponentName() {\n    return "AcmeShopApp";\n  }\n',
    });
    expect(rootRegistration()).toEqual({
      registers: 'named',
      name: 'AcmeShopApp',
      inAppJson: false,
    });
  });

  it("with only an iOS project, the AppDelegate's module name is read, in Swift and Objective-C", () => {
    appWith({
      'ios/AcmeShop/AppDelegate.swift':
        'factory.startReactNative(withModuleName: "AcmeShop", in: window)\n',
    });
    expect(rootRegistration()).toEqual({ registers: 'named', name: 'AcmeShop', inAppJson: false });

    appWith({ 'ios/AcmeShop/AppDelegate.mm': 'self.moduleName = @"main";\n' });
    expect(rootRegistration()).toEqual({ registers: 'main' });
  });
});
