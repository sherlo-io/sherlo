/**
 * `sherlo project list --team <teamId>` - the read-side sibling of
 * `project create`. Same credential (the saved login), same `--team` flag,
 * reused wholesale from ../shared rather than re-resolved here - see
 * ../projectCreate/projectCreate for why `--team` is shaped the way it is.
 */
import { TEAM_OPTION } from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { refuseRejectedLogin, resolveLogin, resolveTeamId } from '../shared';
import { ListProjectsAuthError } from './listProjectsRequest';
import { serverCalls } from '../../seams/serverCalls';
import { THIS_COMMAND } from './constants';

export type ProjectListOptions = {
  [TEAM_OPTION]?: string;
};

async function projectList(passedOptions: ProjectListOptions): Promise<void> {
  printSherloIntro();

  const teamId = resolveTeamId(passedOptions[TEAM_OPTION], {
    thisCommand: THIS_COMMAND,
    purpose: 'the team whose projects to list',
  });
  const login = resolveLogin(THIS_COMMAND);

  reporting.setTag('team_id', teamId);

  const list = await serverCalls()
    .listProjects({ teamId, personalToken: login.token })
    .catch((error: Error) => {
      if (error instanceof ListProjectsAuthError) refuseRejectedLogin();

      throwError({ message: error.message, errorToReport: error });
    });

  emit({ kind: 'project-list', list });
}

export default projectList;
