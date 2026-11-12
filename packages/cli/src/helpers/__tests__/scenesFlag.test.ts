/**
 * The scenes flag reader (../scenesFlag): the service's answer for the team of the project is the
 * only source, asked through the server seam with the saved login, and every way of not knowing
 * (no login, no project, no such team, a failed call, a missing field) is off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectFiles } from '../../seams/projectFiles';
import { installSavedLogins, liveSavedLogins } from '../../seams/savedLogins';
import { installServerCalls, liveServerCalls } from '../../seams/serverCalls';
import { liveWorkstation } from '../../seams/workstation';
import { decideScenesBeforeCommands } from '../sceneOptions';
import { decideScenesForProject, forgetScenesFlag, rememberedScenesFlag } from '../scenesFlag';

const TEAM = 'k3j9x2ab';
const OTHER_TEAM = 'zz9999zz';

const listTeams = vi.fn();
let restores: (() => void)[];
let folder: string;

beforeEach(() => {
  forgetScenesFlag();
  listTeams.mockReset();
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-flag-'));
  restores = [
    installServerCalls({ ...liveServerCalls, listTeams }),
    installSavedLogins({ ...liveSavedLogins, read: () => ({ token: 'secret', email: 'a@b.c' }) }),
  ];
});

afterEach(() => {
  restores.forEach((restore) => restore());
  fs.rmSync(folder, { recursive: true, force: true });
  vi.restoreAllMocks();
  forgetScenesFlag();
});

const teamsAnswering = (...rows: { id: string; featureFlags?: { scenes?: boolean } }[]) =>
  listTeams.mockResolvedValue({
    teams: rows.map((row) => ({ name: 'Team', projectCount: 1, role: 'owner', ...row })),
  });

describe('the scenes flag', () => {
  it('a team whose flags carry scenes on reads as on', async () => {
    teamsAnswering({ id: OTHER_TEAM }, { id: TEAM, featureFlags: { scenes: true } });

    await decideScenesForProject(`${TEAM}/1`);

    expect(rememberedScenesFlag()).toBe('on');
    expect(listTeams).toHaveBeenCalledWith({ personalToken: 'secret' });
  });

  it('a team with no scenes flag, or a failed flag call, reads as off', async () => {
    teamsAnswering({ id: TEAM });
    await decideScenesForProject(`${TEAM}/1`);
    expect(rememberedScenesFlag()).toBe('off');

    teamsAnswering({ id: TEAM, featureFlags: { scenes: true } });
    await decideScenesForProject(`${OTHER_TEAM}/1`);
    expect(rememberedScenesFlag()).toBe('off');

    teamsAnswering({ id: TEAM, featureFlags: { scenes: true } });
    await decideScenesForProject(undefined);
    expect(rememberedScenesFlag()).toBe('off');

    listTeams.mockRejectedValue(new Error('HTTP 500'));
    await decideScenesForProject(`${TEAM}/1`);
    expect(rememberedScenesFlag()).toBe('off');
  });

  it('a run with no saved login reads as off without asking the service', async () => {
    restores.push(installSavedLogins({ ...liveSavedLogins, read: () => undefined }));

    await decideScenesForProject(`${TEAM}/1`);

    expect(rememberedScenesFlag()).toBe('off');
    expect(listTeams).not.toHaveBeenCalled();
  });

  it('setup decides scenes from the project it chose, not from the folder it started in', async () => {
    teamsAnswering({ id: TEAM, featureFlags: { scenes: true } });
    restores.push(installProjectFiles({ root: () => folder }));

    // Before init knows a project the folder names none: off.
    await decideScenesBeforeCommands(['node', 'sherlo', 'capture']);
    expect(rememberedScenesFlag()).toBe('off');

    // Setup then asks again for the project it chose, and the run's workstation answers on.
    await liveWorkstation.askScenesFlag(`${TEAM}/1`);
    expect(liveWorkstation.scenesFlag()).toBe('on');
  });
});
