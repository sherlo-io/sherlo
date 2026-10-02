/**
 * SETUP'S PROJECT STEP AND WHAT THE CONFIG STEP WRITES (sherlo / How setup names the project).
 *
 * The project step runs on posed seams installed by hand - the service, the saved logins, the
 * browser, the clock and the settings - and on a workstation of this file's own, which answers
 * setup's questions the way a person would and records every question it was asked. A pose cannot
 * answer a question, so these cases are the only place a chosen team or project is seen.
 */
import fs from 'fs';
import path from 'path';
import { format } from 'util';
import { describe, expect, it, vi } from 'vitest';
import { installBrowser, posedBrowser } from '../../../seams/browser';
import {
  installProjectFiles,
  posedProjectFiles,
  type PosedFiles,
} from '../../../seams/projectFiles';
import { installSavedLogins, posedSavedLogins, type PosedLogins } from '../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  type ScriptedCall,
  type ServerCalls,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';
import { installWorkstation, type Workstation } from '../../../seams/workstation';
import config from '../config';
import project from '../project';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';

const TEAM_ID = 'k3j9x2ab';
const OTHER_TEAM_ID = 'zz99yy88';

/** A project token for project 4 of TEAM_ID: 32 characters of api token, the team id, the number. */
const PROJECT_TOKEN = `${'a'.repeat(32)}${TEAM_ID}4`;

const FLAG_TOKEN = 'sht_flagtoken0000000000000000000000';
const ENV_TOKEN = 'sht_envtoken00000000000000000000000';
const SAVED_TOKEN = 'sht_savedtoken000000000000000000000';
const LOGIN_TOKEN = 'sht_logintoken000000000000000000000';

const SAVED_LOGIN: PosedLogins = {
  [SERVICE_ADDRESS]: { email: 'saved@example.com', token: SAVED_TOKEN },
};

const LOGIN_ID = 'lg7Qm2Xa';
const LOGIN_EXPIRES_AT = '2026-10-01T12:10:00.000Z';
/** A moment inside the pending login's ten minutes. */
const BEFORE_LOGIN_EXPIRY = '2026-10-01T12:00:05.000Z';

const THE_BROWSER_LOGIN: ScriptedCall[] = [
  {
    call: 'startCliLogin',
    with: {},
    answer: {
      loginId: LOGIN_ID,
      authorizeUrl: `https://app.sherlo.io/cli-login/${LOGIN_ID}`,
      expiresAt: LOGIN_EXPIRES_AT,
    },
  },
  {
    call: 'pollCliLogin',
    with: { loginId: LOGIN_ID },
    answer: { status: 'approved', email: 'new@example.com', token: LOGIN_TOKEN },
  },
];

const LIST_TEAMS: ScriptedCall = {
  call: 'listTeams',
  with: {},
  answer: {
    teams: [
      { id: TEAM_ID, name: 'Acme', projectCount: 2, role: 'owner' },
      { id: OTHER_TEAM_ID, name: 'Side Gig', projectCount: 0, role: 'member' },
    ],
  },
};

const LIST_PROJECTS: ScriptedCall = {
  call: 'listProjects',
  with: { teamId: TEAM_ID },
  answer: {
    team: { id: TEAM_ID, name: 'Acme' },
    projects: [
      { index: 4, name: 'Design System', buildCount: 12, mainBranch: 'main' },
      { index: 7, name: 'Mobile App', buildCount: 0, mainBranch: null },
    ],
  },
};

/** The two calls that check a `--project` the person can reach. */
const CHECK_PROJECT: ScriptedCall[] = [LIST_TEAMS, LIST_PROJECTS];

describe('setup names the project', () => {
  it('setup spends --personal-token, then SHERLO_PERSONAL_TOKEN, then the saved login, and runs the login only when it has none', async () => {
    const givenProject = { project: `${TEAM_ID}/4` };

    const withAll = await runProjectStep({
      options: { ...givenProject, personalToken: FLAG_TOKEN },
      env: { SHERLO_PERSONAL_TOKEN: ENV_TOKEN },
      logins: SAVED_LOGIN,
      api: CHECK_PROJECT,
    });
    expect(withAll.tokensSpent).toEqual([FLAG_TOKEN, FLAG_TOKEN]);

    const withEnvAndLogin = await runProjectStep({
      options: givenProject,
      env: { SHERLO_PERSONAL_TOKEN: ENV_TOKEN },
      logins: SAVED_LOGIN,
      api: CHECK_PROJECT,
    });
    expect(withEnvAndLogin.tokensSpent).toEqual([ENV_TOKEN, ENV_TOKEN]);

    const withLoginOnly = await runProjectStep({
      options: givenProject,
      logins: SAVED_LOGIN,
      api: CHECK_PROJECT,
    });
    expect(withLoginOnly.tokensSpent).toEqual([SAVED_TOKEN, SAVED_TOKEN]);

    // None of the three runs above started a login: their scripts hold no login call, and every
    // scripted call was made.
    for (const run of [withAll, withEnvAndLogin, withLoginOnly]) {
      expect(run.refusal).toBeUndefined();
      expect(run.unansweredCalls).toEqual([]);
      expect(run.unusedCalls).toEqual([]);
      expect(run.printed).not.toContain('Log in to Sherlo at this link:');
    }

    const withNothing = await runProjectStep({
      options: givenProject,
      api: [...THE_BROWSER_LOGIN, ...CHECK_PROJECT],
    });
    expect(withNothing.refusal).toBeUndefined();
    expect(withNothing.unusedCalls).toEqual([]);
    expect(withNothing.printed).toContain('Log in to Sherlo at this link:');
    expect(withNothing.printed).toContain('Logged in as new@example.com');
    // The login it ran is the one it spends.
    expect(withNothing.tokensSpent).toEqual([LOGIN_TOKEN, LOGIN_TOKEN]);
    expect(withNothing.project).toBe(`${TEAM_ID}/4`);
  });

  it('setup with --token writes the project read from the token and says the token belongs in CI as SHERLO_TOKEN', async () => {
    // No login and no call at all: the token names the project.
    const run = await runProjectStep({ options: { token: PROJECT_TOKEN }, api: [] });

    expect(run.refusal).toBeUndefined();
    expect(run.unansweredCalls).toEqual([]);
    expect(run.project).toBe(`${TEAM_ID}/4`);
    expect(plain(run.printed)).toContain(`Using the project from your token: ${TEAM_ID}/4`);
    expect(run.printed).toContain('  The token is not written to sherlo.config.json.');
    expect(run.printed).toContain('  Add it to your CI as the SHERLO_TOKEN secret.');
    expect(run.printed).not.toContain(PROJECT_TOKEN);

    const written = await runConfigStep({
      files: {},
      projectToWrite: run.project as string,
    });
    expect(written.config).toEqual(expect.objectContaining({ project: `${TEAM_ID}/4` }));
    expect(written.config).not.toHaveProperty('token');
  });

  it('setup refuses a --project the logged-in person cannot reach', async () => {
    const notTheirTeam = await runProjectStep({
      options: { project: 'nothers1/4' },
      logins: SAVED_LOGIN,
      api: [LIST_TEAMS],
    });
    expect(notTheirTeam.refusal).toBe(
      'You have no access to the project `nothers1/4`.\n' +
        '  Run `sherlo project list --team <id>` to see the projects you can reach.\n' +
        '  Or leave out `--project` and choose one.'
    );

    const notTheirProject = await runProjectStep({
      options: { project: `${TEAM_ID}/9` },
      logins: SAVED_LOGIN,
      api: CHECK_PROJECT,
    });
    expect(notTheirProject.refusal).toContain(
      `You have no access to the project \`${TEAM_ID}/9\`.`
    );

    for (const run of [notTheirTeam, notTheirProject]) {
      expect(run.unusedCalls).toEqual([]);
      expect(run.project).toBeUndefined();
    }
  });

  it('setup asks which team and project when no --project is given, and offers to make a project', async () => {
    const run = await runProjectStep({
      options: {},
      logins: SAVED_LOGIN,
      api: [LIST_TEAMS, LIST_PROJECTS],
      answers: [TEAM_ID, 7],
    });

    expect(run.refusal).toBeUndefined();
    expect(run.unusedCalls).toEqual([]);
    expect(run.project).toBe(`${TEAM_ID}/7`);

    const [teamQuestion, projectQuestion] = run.questions;
    expect(teamQuestion).toEqual({
      question: 'Which team is this app for?',
      choices: ['Acme', 'Side Gig'],
    });
    // The team's projects, then the choice to make a new one, last.
    expect(projectQuestion).toEqual({
      question: 'Which project is this app for?',
      choices: ['Design System', 'Mobile App', 'Make a new project'],
    });

    // A person in no team is offered to make one first, and asked its name.
    const inNoTeam = await runProjectStep({
      options: {},
      logins: SAVED_LOGIN,
      api: [
        { call: 'listTeams', with: {}, answer: { teams: [] } },
        { call: 'createTeam', with: { name: 'Acme' }, answer: { id: TEAM_ID, name: 'Acme' } },
        LIST_PROJECTS,
      ],
      answers: [true, 'Acme', 4],
    });
    expect(inNoTeam.refusal).toBeUndefined();
    expect(inNoTeam.unusedCalls).toEqual([]);
    expect(inNoTeam.questions.map(({ question }) => question)).toEqual([
      'You are not in a team yet. Make one now?',
      'What should the team be called?',
      'Which project is this app for?',
    ]);
    expect(inNoTeam.project).toBe(`${TEAM_ID}/4`);
  });

  it('setup prints the project token of a project it made once, as the CI token', async () => {
    const newProjectToken = `${'b'.repeat(32)}${TEAM_ID}8`;

    const run = await runProjectStep({
      options: {},
      logins: SAVED_LOGIN,
      api: [
        LIST_TEAMS,
        LIST_PROJECTS,
        {
          call: 'createProject',
          with: { teamId: TEAM_ID, name: 'Storefront' },
          answer: { name: 'Storefront', index: 8, projectToken: newProjectToken },
        },
      ],
      answers: [TEAM_ID, 'make-a-new-project', 'Storefront'],
    });

    expect(run.refusal).toBeUndefined();
    expect(run.unusedCalls).toEqual([]);
    expect(run.questions[run.questions.length - 1].question).toBe(
      'What should the new project be called?'
    );
    expect(run.project).toBe(`${TEAM_ID}/8`);

    const lines = plain(run.printed).split('\n');
    const tokenLines = lines.filter((line) => line.includes(newProjectToken));

    // Once, alone on its line, under the shown-once warning, and on no `key=value` line.
    expect(tokenLines).toEqual([`  ${newProjectToken}`]);
    const tokenLineIndex = lines.indexOf(`  ${newProjectToken}`);
    expect(lines[tokenLineIndex - 2]).toBe(
      'Project token - shown once. Store it now; it cannot be shown again.'
    );
    expect(lines[tokenLineIndex + 2]).toBe('Add it to your CI as the SHERLO_TOKEN secret.');
  });

  it('setup writes the project into the config and never a token', async () => {
    const created = await runConfigStep({ files: {}, projectToWrite: `${TEAM_ID}/4` });
    expect(created.config).toEqual({
      project: `${TEAM_ID}/4`,
      devices: [
        { id: 'iphone.15.pro', osVersion: '17' },
        { id: 'pixel.7.pro', osVersion: '13' },
      ],
    });
    expect(plain(created.printed)).toContain(`Added project ${TEAM_ID}/4 to sherlo.config.json`);

    // An older setup's token stays where it was, untouched; the project replaces the old one.
    const olderToken = `${'c'.repeat(32)}${TEAM_ID}2`;
    const updated = await runConfigStep({
      files: {
        'sherlo.config.json': {
          token: olderToken,
          project: `${TEAM_ID}/2`,
          devices: [{ id: 'pixel.7.pro', osVersion: '13' }],
        },
      },
      projectToWrite: `${TEAM_ID}/4`,
    });
    expect(updated.config).toEqual({
      token: olderToken,
      project: `${TEAM_ID}/4`,
      devices: [{ id: 'pixel.7.pro', osVersion: '13' }],
    });
  });
});

/* ========================================================================== */

/** One answer the test workstation gives, in the order setup asks. */
type Answer = string | number | boolean;

type AskedQuestion = { question: string; choices?: string[] };

/**
 * Run the project step on posed seams and a workstation that answers from `answers`, in order.
 * Answers what it printed, what it refused with, the project it settled, every personal token it
 * spent on a call, and every question it asked.
 */
async function runProjectStep(world: {
  options: { token?: string; personalToken?: string; project?: string };
  env?: Record<string, string>;
  logins?: PosedLogins;
  api: ScriptedCall[];
  answers?: Answer[];
}) {
  const posedCalls = posedServerCalls(world.api);
  const tokensSpent: string[] = [];
  const recordingCalls: ServerCalls = {
    ...posedCalls,
    listTeams: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.listTeams(request);
    },
    listProjects: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.listProjects(request);
    },
  };

  const questions: AskedQuestion[] = [];
  const answers = [...(world.answers ?? [])];
  const nextAnswer = <Value>(): Value => {
    if (answers.length === 0) throw new Error('the test gives no further answers');
    return answers.shift() as Value;
  };
  const person: Workstation = {
    addPackage: async () => {
      throw new Error('the project step installs nothing');
    },
    installPods: async () => {
      throw new Error('the project step installs nothing');
    },
    somebodyIsAtTheKeyboard: () => true,
    readEnterPress: async () => undefined,
    chooseOne: async ({ question, choices }) => {
      questions.push({ question, choices: choices.map(({ name }) => name) });
      return nextAnswer();
    },
    askForText: async ({ question }) => {
      questions.push({ question });
      return nextAnswer();
    },
    askYesOrNo: async ({ question }) => {
      questions.push({ question });
      return nextAnswer();
    },
  };

  const files = posedProjectFiles({});
  const surroundings = posedSurroundings({
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS, ...world.env },
    git: 'none',
    clock: [BEFORE_LOGIN_EXPIRY],
  });

  const uninstall = [
    installServerCalls(recordingCalls),
    installSavedLogins(posedSavedLogins(world.logins)),
    installBrowser(posedBrowser({ opened: true })),
    installProjectFiles(files),
    installWorkstation(person),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  try {
    const { printed, result, refusal } = await capturePrinted(() => project(world.options));

    return {
      printed,
      refusal,
      project: result,
      tokensSpent,
      questions,
      unansweredCalls: posedCalls.refusals(),
      unusedCalls: posedCalls.unusedCalls(),
    };
  } finally {
    for (const undo of uninstall.reverse()) undo();
    files.remove();
  }
}

/** Run the config step in a project folder laid out from `files`, and read back what it wrote. */
async function runConfigStep({
  files,
  projectToWrite,
}: {
  files: PosedFiles;
  projectToWrite: string;
}) {
  const folder = posedProjectFiles(files);
  const api = posedServerCalls([
    { call: 'trackCliInit', with: { event: '5_config' }, answer: { sessionId: 'init-session-1' } },
  ]);
  const uninstall = [installProjectFiles(folder), installServerCalls(api)];

  try {
    const { printed, refusal } = await capturePrinted(() =>
      config({ sessionId: null, project: projectToWrite })
    );
    expect(refusal).toBeUndefined();

    const written = fs.readFileSync(path.join(folder.root(), 'sherlo.config.json'), 'utf8');

    return { printed, config: JSON.parse(written) as Record<string, unknown> };
  } finally {
    for (const undo of uninstall.reverse()) undo();
    folder.remove();
  }
}

/** Run `body`, and answer everything it printed through the console, and how it ended. */
async function capturePrinted<Result>(body: () => Promise<Result>) {
  let printed = '';
  const record = (...args: unknown[]) => {
    printed += `${format(...args)}\n`;
  };
  const logSpy = vi.spyOn(console, 'log').mockImplementation(record);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(record);

  let result: Result | undefined;
  let refusal: string | undefined;
  try {
    result = await body();
  } catch (error) {
    refusal = plain((error as Error).message)
      .replace(/^(AUTH )?ERROR: /, '')
      .trimEnd();
  } finally {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  }

  return { printed, result, refusal };
}

/** Text with its colour taken off, for a case about words rather than styling. */
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
