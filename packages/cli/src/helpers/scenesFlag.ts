/**
 * ARE SCENES ON FOR THIS TEAM - the one place that asks, and the one that remembers.
 *
 * Scenes are a per-team feature: the service answers `featureFlags { scenes }` on each team of
 * `listTeams`. The CLI reads the row of the PROJECT's team (the team half of sherlo.config.json's
 * `project`) with the login saved on this computer, through the server seam. No saved login, no
 * project, no such team, a failed call or no field: scenes are OFF, and nothing is said about it.
 *
 * The answer is kept for the run and handed out through `workstation().scenesFlag()`, so a posed
 * run and a live one are asked the same way.
 */
import { savedLogins } from '../seams/savedLogins';
import { serverCalls } from '../seams/serverCalls';
import { getEndpointUrl } from './buildStatusRequest';
import { parseConfigProject } from './getValidatedCommandParams/validateCommandParams/resolvePushCredential';

/** What the service answered for this run, once something has asked. */
let answered: boolean | undefined;

/** This run's answer in the words of the workstation seam; undefined while nobody has asked. */
export function rememberedScenesFlag(): 'on' | 'off' | undefined {
  if (answered === undefined) return undefined;

  return answered ? 'on' : 'off';
}

/**
 * Ask the service whether the team of `configProject` (`<teamId>/<number>`) has scenes on, and
 * remember the answer for the rest of the run. Any way of not knowing is off.
 */
export async function decideScenesForProject(configProject: unknown): Promise<void> {
  try {
    const login = savedLogins().read(getEndpointUrl());
    // A `--token` run with no saved login lands here and reads off: no service call answers the
    // flag for a project token (only `listTeams` does, and it takes a personal token). So such a
    // run is refused for an app with no Storybook, even when the team has scenes on.
    if (!login) {
      answered = false;
      return;
    }

    const { teamId } = parseConfigProject(configProject);
    const { teams } = await serverCalls().listTeams({ personalToken: login.token });

    answered = teams.find((team) => team.id === teamId)?.featureFlags?.scenes === true;
  } catch {
    // A malformed project, a failed call or an error answer are all "not known": off, said nowhere.
    answered = false;
  }
}

/** Forget the run's answer - for a test that starts from nobody having asked. */
export function forgetScenesFlag(): void {
  answered = undefined;
}
