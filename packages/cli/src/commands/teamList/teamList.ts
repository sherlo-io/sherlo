/**
 * `sherlo team list` - the account-scoped sibling of `project list`. Same
 * credential (the saved login), no `--team` flag: it answers with every team
 * the logged-in person belongs to, not one named team.
 */
import { printSherloIntro, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { refuseRejectedLogin, resolveLogin } from '../shared';
import { ListTeamsAuthError } from './listTeamsRequest';
import { serverCalls } from '../../seams/serverCalls';
import { THIS_COMMAND } from './constants';

async function teamList(): Promise<void> {
  printSherloIntro();

  const login = resolveLogin(THIS_COMMAND);

  const list = await serverCalls()
    .listTeams({ personalToken: login.token })
    .catch((error: Error) => {
      if (error instanceof ListTeamsAuthError) refuseRejectedLogin();

      throwError({ message: error.message, errorToReport: error });
    });

  emit({ kind: 'team-list', list });
}

export default teamList;
