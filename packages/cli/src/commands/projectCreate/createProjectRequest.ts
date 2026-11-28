/**
 * The ONE call `sherlo project create` makes, and the exact bytes it sends.
 *
 * WHY RAW FETCH RATHER THAN `@sherlo/sdk-client`. The published sdk client
 * carries the build-run operations and nothing else - `createProject` is not
 * among them, and it should not be: that client is the credential surface a
 * TEST RUN uses, and this mutation is authorized by a different credential
 * entirely. helpers/waitForBuildResult already issues its poll this way for
 * comparable reasons, so the shape below is the house pattern, not a new one.
 *
 * THE ONE THING THAT WILL BREAK IF IT IS "TIDIED": `teamId` MUST TRAVEL AS A
 * GRAPHQL VARIABLE. The api's personal-token authorizer reads the team it is
 * about to check the caller's role against from `requestContext.variables`
 * (sherlo-api `_personalTokenAuthorizer.ts`), not from the query text. Inline
 * the argument into the document and the request is denied with
 * `missingTeamIdVariable` - a refusal that looks exactly like a bad token.
 *
 * THE SELECTION SET IS THREE FIELDS AND IT IS DELIBERATELY SHORT. `Project`
 * also carries `apiTokenHash`, and a personal token could select it; asking for
 * only what is printed means a secret this command has no use for never enters
 * the process at all.
 */
import fetch from 'node-fetch';
import type { ProjectCreated } from '../../render/projectCreated';
import { isRefusalErrorType } from '../../seams/serviceRefusedToken';

/** Bounded so a hung endpoint cannot leave the command waiting forever. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * `mutation createProject`.
 *
 * The operation name the api's authorizer routes on is read off the FIRST
 * `{word(` in the whitespace-stripped document, so the field below has to stay
 * the first selection in the body. It is today and there is nothing else to put
 * before it, but a wrapper field added here would silently route the request to
 * deny-by-default.
 */
const CREATE_PROJECT_MUTATION = `
  mutation createProject($name: String!, $teamId: String!) {
    createProject(name: $name, teamId: $teamId) {
      name
      index
      projectToken
    }
  }
`;

export class CreateProjectAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateProjectAuthError';
  }
}

/**
 * The service refused the project's name as longer than it takes (sherlo-api createProject). It
 * carries the name and team the request sent, so a refusal can name both.
 */
export class CreateProjectNameTooLongError extends Error {
  constructor(
    message: string,
    readonly asked: { name: string; teamId: string }
  ) {
    super(message);
    this.name = 'CreateProjectNameTooLongError';
  }
}

/**
 * The service's own code for a name over its limit. sherlo-api's resolver throws it as its log
 * label (`resolvers:mutations:createProject:tooLongName`, utils/throwAsyncError), the label alone
 * on the error's first line: the code is read off that line's last two segments, never its prose.
 */
const NAME_TOO_LONG_CODE = ['createProject', 'tooLongName'];

function isNameTooLongCode(message: string | undefined): boolean {
  const segments = (message ?? '').split('\n')[0].split(':');
  return segments.slice(-2).join(':') === NAME_TOO_LONG_CODE.join(':');
}

/**
 * The effects this request is made of, injected so a contract test can assert
 * the exact payload without a network. The default is the real thing.
 */
export type CreateProjectEffects = {
  fetch: typeof fetch;
  endpointUrl: () => string;
};

export const REAL_CREATE_PROJECT_EFFECTS: CreateProjectEffects = {
  fetch,
  endpointUrl: () => {
    const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
    return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
  },
};

/**
 * Create the project and answer the three fields the CLI prints.
 *
 * `personalToken` is used and discarded: it goes into the Authorization header
 * and nowhere else - not into an error message, not into a breadcrumb, not into
 * a thrown error's text.
 */
async function createProjectRequest(
  { name, teamId, personalToken }: { name: string; teamId: string; personalToken: string },
  effects: CreateProjectEffects = REAL_CREATE_PROJECT_EFFECTS
): Promise<ProjectCreated> {
  const response = await effects.fetch(effects.endpointUrl(), {
    method: 'POST',
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      // The lambda authorizer accepts either a bare string or this JSON
      // envelope, and every other CLI caller sends the envelope.
      Authorization: JSON.stringify({ authToken: personalToken }),
    },
    body: JSON.stringify({
      query: CREATE_PROJECT_MUTATION,
      variables: { name, teamId },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new CreateProjectAuthError(`HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { createProject?: Partial<ProjectCreated> | null };
    errors?: { errorType?: string; message?: string }[];
  };

  if (json.errors?.length) {
    const isAuthError = json.errors.some((error) => isRefusalErrorType(error.errorType));

    if (isAuthError) throw new CreateProjectAuthError('GraphQL authorization error');

    const nameTooLong = json.errors.find((error) => isNameTooLongCode(error.message));
    if (nameTooLong) {
      throw new CreateProjectNameTooLongError(nameTooLong.message ?? '', { name, teamId });
    }

    // The api's own words. They are the server's prose about the request the
    // user made (an empty name, a name over the limit), never a credential.
    throw new Error(json.errors.map((error) => error.message ?? 'unknown error').join('; '));
  }

  const project = json.data?.createProject;

  // A response the CLI cannot print is not a success. Better to say the project
  // may exist than to print `undefined` where a token belongs.
  if (!project?.name || project.index === undefined || !project.projectToken) {
    throw new Error(
      'The API answered without the project it created. Check the Sherlo web app before ' +
        'retrying - a project may exist whose token was never shown.'
    );
  }

  return { name: project.name, index: project.index, projectToken: project.projectToken };
}

export default createProjectRequest;
