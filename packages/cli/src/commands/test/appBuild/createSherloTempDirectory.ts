/**
 * THE HAND-OVER FILE, `.sherlo/data.json` - what `sherlo test` in EAS mode leaves in the project for
 * each EAS build to find on Expo's machine.
 *
 * It travels with the uploaded project, so it carries no token: only the one-build ticket the
 * service answered when it opened the run, which can fill that run's slots and close it, for about a
 * day. It is written through the project's one `.sherlo/` writer (./cacheFolder), whose
 * `.sherlo/.gitignore` keeps the file in EAS's upload without anyone editing their own `.gitignore`.
 */
import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DATA_FILENAME } from '../../../constants';
import type { BaseFingerprints } from '../../../helpers/fingerprint';
import { makeProjectSherloFolder } from './cacheFolder';

/** What the hand-over file holds. */
export type HandOverFile = {
  /** The run the EAS builds deliver into. */
  buildIndex: number;
  /** The one-build ticket the EAS hook spends, in place of any token. */
  ticket: string;
  /** The team and project the run belongs to, which the hook's requests name. */
  teamId: string;
  projectIndex: number;
  /**
   * The eas.json profile the builds start with, so the hook script needs no `--profile`. Always
   * written; a file without it leaves the hook to `--profile`.
   */
  profile?: string;
  /**
   * The Sherlo address the run was opened on, when SHERLO_API_URL chose it: Expo's machine knows no
   * address of its own, so the hook calls this one first.
   */
  apiUrl?: string;
  /**
   * Each EAS-built platform's base fingerprint, as the push took it before anything was built - the
   * one its gate was asked with. The hook registers the base with it: on Expo's machine prebuild and
   * the build have written into the project, so a fingerprint taken there is not the one the next
   * push computes. A file from an older CLI carries none.
   */
  fingerprints?: Partial<BaseFingerprints>;
};

function createSherloTempDirectory(projectRoot: string, handOver: HandOverFile): void {
  const sherloFolder = makeProjectSherloFolder(projectRoot);

  fs.writeFileSync(
    path.join(sherloFolder, SHERLO_TEMP_DATA_FILENAME),
    JSON.stringify(handOver, null, 2)
  );
}

export default createSherloTempDirectory;
