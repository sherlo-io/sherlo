/**
 * WHAT `sherlo feedback` REFUSES, WHAT IT SENDS, AND WHAT IT NEVER SENDS.
 *
 * `runFeedback` calls the command straight on posed seams: a project folder with the report in a
 * file, a saved login, and a service that writes down every request it is sent.
 */
import { describe, expect, it } from 'vitest';
import feedback from '../feedback';
import { captureTranscript } from '../../../helpers/transcriptSink';
import {
  installProjectFiles,
  posedProjectFiles,
  type PosedFiles,
} from '../../../seams/projectFiles';
import { installSavedLogins, posedSavedLogins } from '../../../seams/savedLogins';
import {
  installServerCalls,
  ServiceRefusedTokenError,
  type FeedbackContext,
  type ServerCalls,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const ANNA = { email: 'anna@example.com', token: 'sht_annatoken0000000000000000000000' };
const PROJECT_TOKEN = `${'a'.repeat(32)}k3j9x2ab4`;
const DEVICES = [
  { id: 'iphone-15', osVersion: '17.0', theme: 'light', locale: 'en_US', fontScale: '1' },
];

const BUG_REPORT = '## Steps\nran sherlo test\n## Happened\nit crashed\n## Expected\nit passes';

type SentRequest = { kind: string; report: string; context: FeedbackContext };

describe('sherlo feedback', () => {
  it('Once the report is stored, it prints a thank-you, the reference and what was sent with it', async () => {
    const { printed, refusal, sent } = await runFeedback({});

    expect(refusal).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'bug', report: BUG_REPORT });
    expect(plain(printed)).toContain('Feedback sent - thank you! Reference: FB-1');
    expect(plain(printed)).toContain('Sent with it:');
    expect(plain(printed)).toContain('The Sherlo, React Native, Expo and Storybook versions');
    expect(plain(printed)).toContain('The package manager and the operating system');
    expect(plain(printed)).toContain('The project and its devices');
  });

  it("A report missing a section its type needs is refused once, naming the type's sections and every one missing", async () => {
    const { refusal, sent } = await runFeedback({ report: '## Steps\nran sherlo test' });

    expect(plain(refusal)).toContain(
      'Not sent: a bug report is sent with Steps, Happened and Expected, and this one has no Happened or Expected.'
    );
    expect(plain(refusal)).toContain('Each section can be answered with "unknown"');
    expect(sent).toEqual([]);
  });

  it('The word unknown under a heading answers that section', async () => {
    const { refusal, sent } = await runFeedback({
      report: '## Steps\nunknown\n## Happened\nunknown\n## Expected\nunknown',
    });

    expect(refusal).toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it('A report under 10 or over 4,000 characters is refused', async () => {
    const tooShort = await runFeedback({ kind: 'other', report: 'too short' });
    const tooLong = await runFeedback({ kind: 'other', report: 'a b '.repeat(1001) });

    expect(plain(tooShort.refusal)).toContain(
      'Not sent: a report is between 10 and 4,000 characters, and this one is 9.'
    );
    expect(plain(tooLong.refusal)).toContain('and this one is 4003.');
    expect([...tooShort.sent, ...tooLong.sent]).toEqual([]);
  });

  it('No type, or a type that does not exist, is refused with the four types and their sections, the words its help prints', async () => {
    const noType = await runFeedback({ kind: undefined });
    const unknownType = await runFeedback({ kind: 'poem' });

    expect(plain(noType.refusal)).toContain(
      'Not sent: the report has no kind. Set one with --kind.'
    );
    expect(plain(unknownType.refusal)).toContain(
      'Not sent: "poem" is not a kind of report. The kinds are bug, missing, unclear and other.'
    );
    for (const { refusal } of [noType, unknownType]) {
      expect(plain(refusal)).toContain('--kind bug');
      expect(plain(refusal)).toContain('## Steps');
      expect(plain(refusal)).toContain('--kind missing');
      expect(plain(refusal)).toContain('## Missing');
      expect(plain(refusal)).toContain('--kind unclear');
      expect(plain(refusal)).toContain('## Understood');
      expect(plain(refusal)).toContain('--kind other');
    }
    expect([...noType.sent, ...unknownType.sent]).toEqual([]);
  });

  it('A report given as words after the command, or with no --file, is refused, naming the quoted here-document', async () => {
    const asWords = await runFeedback({ words: ['it', 'crashed'] });
    const withNoFile = await runFeedback({ file: undefined });

    for (const { refusal, sent } of [asWords, withNoFile]) {
      expect(plain(refusal)).toContain('Not sent: a report is read from a file, not from words');
      expect(plain(refusal)).toContain("npx sherlo feedback --kind bug --file - <<'EOF'");
      expect(sent).toEqual([]);
    }
  });

  it('--file - with nothing piped in is refused', async () => {
    const { refusal, sent } = await runFeedback({ file: '-', stdinIsATerminal: true });

    expect(plain(refusal)).toContain(
      'Not sent: --file - reads the report from a pipe or a here-document, and nothing was piped in.'
    );
    expect(sent).toEqual([]);
  });

  it('Nothing else leaves the machine: no token, no saved login, no environment value, nothing from the config beyond the project and its devices, and no agent session id', async () => {
    const { sent } = await runFeedback({
      env: {
        CLAUDECODE: '1',
        CLAUDE_SESSION: 'agent-session-4821',
        SOME_SETTING: 'environment-value-7734',
      },
      files: {
        'sherlo.config.json': { token: PROJECT_TOKEN, devices: DEVICES, android: 'app.apk' },
      },
    });

    const [request] = sent;
    const wire = JSON.stringify(request);
    expect(request.context.agent).toBe('Claude Code');
    expect(request.context.project).toEqual({ teamId: 'k3j9x2ab', projectIndex: 4 });
    expect(request.context.devices).toEqual(DEVICES);
    const allowedFacts = [
      'agent',
      'cliVersion',
      'sdkVersion',
      'reactNativeVersion',
      'expoVersion',
      'storybookVersion',
      'packageManager',
      'operatingSystem',
      'project',
      'devices',
      'lastCommand',
    ];
    expect(Object.keys(request.context).filter((fact) => !allowedFacts.includes(fact))).toEqual([]);
    for (const left of [
      PROJECT_TOKEN,
      ANNA.token,
      'environment-value-7734',
      'agent-session-4821',
      'app.apk',
    ]) {
      expect(wire).not.toContain(left);
    }
  });

  it('Anything shaped like a token or a key is blanked out before it is sent, and a dry run shows it blanked', async () => {
    const report = `${BUG_REPORT}\nmy token is sht_abcdefghijklmnopqrstuvwx and Authorization: Bearer abcdef0123456789`;
    const sending = await runFeedback({ report });
    const dryRun = await runFeedback({ report, dryRun: true });

    expect(sending.sent[0].report).toContain('my token is [blanked] and Authorization: [blanked]');
    expect(JSON.stringify(sending.sent)).not.toContain('sht_abcdefghijklmnop');
    expect(plain(dryRun.printed)).toContain('my token is [blanked] and Authorization: [blanked]');
    expect(plain(dryRun.printed)).not.toContain('abcdef0123456789');
  });

  it('A dry run prints the report and everything sent with it, sends nothing and needs no login', async () => {
    const { printed, refusal, sent } = await runFeedback({
      dryRun: true,
      loggedIn: false,
      env: { CLAUDECODE: '1' },
      files: { 'sherlo.config.json': { token: PROJECT_TOKEN, devices: DEVICES } },
    });

    expect(refusal).toBeUndefined();
    expect(sent).toEqual([]);
    const lines = plain(printed);
    expect(lines).toContain('Dry run - nothing was sent. This bug report is what would be sent:');
    expect(lines).toContain('  ## Steps');
    expect(lines).toContain('Sent with it, tokens and keys blanked out:');
    expect(lines).toContain('  Project: team k3j9x2ab, project number 4');
    expect(lines).toContain('  Devices: iphone-15');
    expect(lines).toMatch(/ {2}Sherlo SDK: .*\n {2}Sherlo CLI: \d/);
    expect(lines).toContain('  React Native: ');
    expect(lines).toContain('  Expo: ');
    expect(lines).toContain('  Storybook: ');
    expect(lines).toContain('  Package manager: ');
    expect(lines).toMatch(/ {2}Operating system: \S+ \d/);
    expect(lines).toContain('  AI agent: Claude Code');
    expect(lines).toContain('  Last command: none recorded');
  });

  it('A dry run shows not known for a fact it has no value for, and none when a person ran the command', async () => {
    const { printed } = await runFeedback({ dryRun: true });

    expect(plain(printed)).toContain('  Project: not known');
    expect(plain(printed)).toContain('  Devices: not known');
    expect(plain(printed)).toContain('  AI agent: none');
  });

  it('Without a saved login the report is refused, naming npx sherlo login', async () => {
    const { refusal, sent } = await runFeedback({ loggedIn: false });

    expect(plain(refusal)).toContain('this computer has none saved');
    expect(plain(refusal)).toContain('npx sherlo login');
    expect(sent).toEqual([]);
  });

  it('When the service cannot be reached the report is refused, nothing is sent, and it asks to send it again', async () => {
    const { printed, refusal } = await runFeedback({ service: 'unreachable' });

    expect(plain(refusal)).toContain('Not sent: Sherlo could not be reached');
    expect(plain(refusal)).toContain('The same command sends the report again');
    expect(plain(printed)).not.toContain('Feedback sent');
  });

  it('When the service refuses the saved login the report is refused, the login is deleted here and it names npx sherlo login', async () => {
    const { printed, refusal, savedLoginLeft } = await runFeedback({
      service: 'refuses-the-token',
    });

    expect(plain(refusal)).toContain('Not sent: Sherlo refused the saved login');
    expect(plain(refusal)).toContain('npx sherlo login');
    expect(plain(refusal)).not.toContain('could not be reached');
    expect(savedLoginLeft).toBe(false);
    expect(plain(printed)).not.toContain('Feedback sent');
  });

  it("A report past the day's limit is refused, saying so, and never asks to send it again now", async () => {
    const { printed, refusal, savedLoginLeft } = await runFeedback({
      service: 'refuses-the-day-limit',
    });

    expect(plain(refusal)).toContain(
      'Not sent: one Sherlo login sends at most 20 reports a day, and this login has reached that limit today.'
    );
    expect(plain(refusal)).toContain('The report can be sent again tomorrow.');
    expect(plain(refusal)).not.toContain('could not be reached');
    expect(plain(refusal)).not.toContain('sends the report again');
    expect(savedLoginLeft).toBe(true);
    expect(plain(printed)).not.toContain('Feedback sent');
  });
});

/* ========================================================================== */

type World = {
  kind?: string;
  /** The report, written to `report.md`, which `file` names by default. */
  report?: string;
  file?: string;
  words?: string[];
  dryRun?: boolean;
  loggedIn?: boolean;
  service?: 'unreachable' | 'refuses-the-token' | 'refuses-the-day-limit';
  stdinIsATerminal?: boolean;
  env?: Record<string, string>;
  files?: PosedFiles;
};

/** Run `feedback()` on posed seams; `sent` is every request the service was sent. */
async function runFeedback(world: World) {
  const sent: SentRequest[] = [];
  const kind = 'kind' in world ? world.kind : 'bug';
  const file = 'file' in world ? world.file : 'report.md';
  const report = world.report ?? BUG_REPORT;

  const surroundings = posedSurroundings({
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS, ...world.env },
    git: 'none',
  });
  const savedLogins = posedSavedLogins(world.loggedIn === false ? {} : { [SERVICE_ADDRESS]: ANNA });
  const projectFiles = posedProjectFiles({ 'report.md': report, ...world.files });
  const isATerminal = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

  const uninstall = [
    installServerCalls({
      sendFeedback: async (request) => {
        sent.push({ kind: request.kind, report: request.report, context: request.context });
        if (world.service === 'unreachable') throw new Error('fetch failed');
        if (world.service === 'refuses-the-token') throw new ServiceRefusedTokenError();
        if (world.service === 'refuses-the-day-limit') {
          throw { graphQLErrors: [{ errorType: 'FeedbackDayLimitReached' }] };
        }
        return { reference: 'FB-1' };
      },
    } as ServerCalls),
    installSavedLogins(savedLogins),
    installSurroundings(surroundings),
    surroundings.installSettings(),
    installProjectFiles(projectFiles),
  ];
  Object.defineProperty(process.stdin, 'isTTY', {
    value: world.stdinIsATerminal === true,
    configurable: true,
  });

  let refusal: string | undefined;
  try {
    const transcript = await captureTranscript(() =>
      feedback(world.words ?? [], { kind, file, dryRun: world.dryRun }).catch((error: Error) => {
        refusal = error.message;
      })
    );

    return {
      sent,
      refusal,
      printed: `${transcript.stdout}${transcript.stderr}`,
      savedLoginLeft: savedLogins.read(SERVICE_ADDRESS) !== undefined,
    };
  } finally {
    for (const undo of uninstall.reverse()) undo();
    projectFiles.remove();
    if (isATerminal) Object.defineProperty(process.stdin, 'isTTY', isATerminal);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
  }
}

/** A screen with its colour taken off, for a case about words rather than styling. */
function plain(screen: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (screen ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
