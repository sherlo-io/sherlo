/**
 * `sherlo login` AND `sherlo logout` POSED - the browser seam and the saved-login seam (sherlo / The
 * seams).
 *
 * WHAT THIS PROVES THAT THE CATALOGUE LAW CANNOT. ./catalogue.test.ts compares the bytes every
 * login and logout pose renders, and those bytes would be the same on a machine where the posed
 * run had quietly opened a real browser, or read and rewritten the real saved-login file. So this
 * case watches the two live halves themselves while every committed login and logout pose runs.
 */
import fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveBrowser } from '../../../seams/browser';
import { liveSavedLogins } from '../../../seams/savedLogins';
import { catalogue } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a posed login reaches no browser and no saved-login file', () => {
  it('a posed login opens no browser and reads or writes no saved-login file on this machine', async () => {
    const browserOpens = vi.spyOn(liveBrowser, 'open');
    const savedLoginReads = vi.spyOn(liveSavedLogins, 'read');
    const savedLoginSaves = vi.spyOn(liveSavedLogins, 'save');
    const savedLoginRemovals = vi.spyOn(liveSavedLogins, 'remove');

    const loginAndLogoutPoses = catalogue().filter(
      ({ name }) => name.startsWith('login/') || name.startsWith('logout/')
    );
    // Every road both commands take: four ways a login ends, an already-saved login, and the three
    // ways a logout ends.
    expect(loginAndLogoutPoses.map(({ name }) => name)).toEqual([
      'login/already-logged-in',
      'login/cancelled',
      'login/expired',
      'login/logged-in',
      'login/no-browser',
      'logout/ended',
      'logout/not-logged-in',
      'logout/service-unreachable',
    ]);

    for (const { name, posePath } of loginAndLogoutPoses) {
      const { refusals } = await runPose(readPoseDocument(fs.readFileSync(posePath, 'utf8')));
      expect(refusals, `${name}: the pose could not answer this run`).toEqual([]);
    }

    expect(browserOpens).not.toHaveBeenCalled();
    expect(savedLoginReads).not.toHaveBeenCalled();
    expect(savedLoginSaves).not.toHaveBeenCalled();
    expect(savedLoginRemovals).not.toHaveBeenCalled();
  });
});
