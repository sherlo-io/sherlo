/**
 * The setup step that writes the app's iOS scheme (../scheme). The schemes come from the live
 * builder's listing (../../../../seams/appBuilder), with xcodebuild answered by a fake runner, so the
 * test build's own pod-scheme filter is what drops the pods here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installAppBuilder,
  makeLiveAppBuilder,
  type RunProcess,
} from '../../../../seams/appBuilder';
import { installProjectFiles } from '../../../../seams/projectFiles';
import scheme from '../scheme';

let somebodyIsAtTheKeyboard: boolean;
let askedChoices: string[] | undefined;
let answer: string;

vi.mock('../../../../seams/workstation', () => ({
  workstation: () => ({
    somebodyIsAtTheKeyboard: () => somebodyIsAtTheKeyboard,
    chooseOne: async ({ choices }: { choices: { name: string; value: string }[] }) => {
      askedChoices = choices.map((choice) => choice.name);
      return answer;
    },
  }),
}));

const POD_SCHEMES = ['Pods-ShopApp', 'Amplitude', 'RNCAsyncStorage'];

let root: string;
let putBack: Array<() => void>;

/** A workspace listing `appSchemes` among the pod schemes, and a Pods project listing those alone. */
function workspaceWith(appSchemes: string[]): void {
  fs.mkdirSync(path.join(root, 'ios/ShopApp.xcworkspace'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ios/Pods/Pods.xcodeproj'), { recursive: true });
  const xcodebuild: RunProcess = async (call) => {
    const listsPods = call.args.includes('Pods/Pods.xcodeproj');
    const list = listsPods
      ? { project: { schemes: POD_SCHEMES } }
      : { workspace: { schemes: [POD_SCHEMES[0], ...appSchemes, ...POD_SCHEMES.slice(1)] } };
    fs.mkdirSync(path.dirname(call.logPath), { recursive: true });
    fs.writeFileSync(call.logPath, JSON.stringify(list));
    return 0;
  };
  putBack.push(installAppBuilder(makeLiveAppBuilder(xcodebuild)));
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, 'sherlo.config.json'), 'utf8'));
}

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, 'sherlo.config.json'), JSON.stringify(config));
}

describe('the scheme setup picks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-scheme-'));
    putBack = [installProjectFiles({ root: () => root })];
    writeConfig({ project: 'k3j9x2ab/4' });
    somebodyIsAtTheKeyboard = true;
    askedChoices = undefined;
    answer = '';
  });

  afterEach(() => {
    for (const undo of putBack) undo();
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a workspace with one app scheme beside pod schemes gets that scheme written to sherlo.config.json', async () => {
    workspaceWith(['ShopApp']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await scheme();

    expect(readConfig()).toEqual({ project: 'k3j9x2ab/4', build: { ios: { scheme: 'ShopApp' } } });
    expect(askedChoices).toBeUndefined();
    expect(log.mock.calls.flat().join('\n')).toContain(
      'iOS scheme "ShopApp" written to sherlo.config.json'
    );
  });

  it("a workspace with two app schemes asks a person, offering only the app's schemes", async () => {
    workspaceWith(['ShopApp', 'ShopAppDev']);
    answer = 'ShopAppDev';
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await scheme();

    expect(askedChoices).toEqual(['ShopApp', 'ShopAppDev']);
    expect(readConfig()).toEqual({
      project: 'k3j9x2ab/4',
      build: { ios: { scheme: 'ShopAppDev' } },
    });
  });

  it('with nobody at the keyboard and two app schemes, setup names them and the config field to set', async () => {
    workspaceWith(['ShopApp', 'ShopAppDev']);
    somebodyIsAtTheKeyboard = false;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await scheme();

    expect(askedChoices).toBeUndefined();
    expect(readConfig()).toEqual({ project: 'k3j9x2ab/4' });
    expect(log.mock.calls.flat().join('\n')).toBe(
      'The iOS workspace has ShopApp and ShopAppDev.\n' +
        '  Name one in sherlo.config.json: "build": { "ios": { "scheme": "ShopApp" } }'
    );
  });

  it('an app with no iOS workspace, or with a scheme already named, is left as it is', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await scheme();
    expect(readConfig()).toEqual({ project: 'k3j9x2ab/4' });

    workspaceWith(['ShopApp', 'ShopAppDev']);
    const named = { project: 'k3j9x2ab/4', build: { ios: { scheme: 'ShopAppDev' } } };
    writeConfig(named);
    await scheme();
    expect(readConfig()).toEqual(named);
    expect(askedChoices).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});
