/**
 * ONE MASKER, THE TOOL'S OWN (sherlo / Drawing for a plan, "What the tool folds on its own").
 *
 * A screen carries values no plan can state and no fixture should pin: a temporary folder, a
 * token, a build's address, a size in megabytes, a duration, the time since a build, a commit id,
 * a fingerprint, the progress lines a wait prints while it waits. Every one of them is folded
 * here to a placeholder BY CLASS - recognised by its shape, never by a literal somebody typed -
 * so the same fold lands on a posed screen and on a live screen alike.
 *
 * THAT IS WHY THIS IS A MODULE AND NOT A BRANCH OF `pose.ts`. The test repository folds a REAL
 * run's screen with `sherlo mask` (below) and compares it against a posed screen folded by
 * `applyMasks`. Two copies of this rule would drift apart on the first class anybody added, and
 * the drift would show up as a storyline that is red for nobody's change.
 *
 * WHAT IS NEVER FOLDED: a value the scenario itself declares - a story count, the deadline a
 * `--wait` was given, a screen's name, a branch name outside a run namespace, an exit code. Masks
 * cover true randomness and time, and nothing else; a fold that reached a declared value would
 * hide the very thing the pose was written to show.
 *
 * ONE FUNCTION PER CLASS, in the order the book page lists them, each named for what it folds. A
 * single function holding every pattern would be unreadable within a month.
 */
/*
 * A SCREEN IS FULL OF ANSI ESCAPES and nearly every pattern below has to say where one ends,
 * so `no-control-regex` fires on this module the way it fires on nothing else. Disabled once
 * here rather than nine times line by line.
 */
/* eslint-disable no-control-regex */
import fs from 'fs';

/**
 * The escape byte every ANSI sequence on a screen starts with, spelled the way a pattern spells
 * it. SPELLED RATHER THAN TYPED: a raw control character sitting in this source would be
 * invisible to whoever read it next.
 */
const ESCAPE = '\\u001b';

/**
 * The two paths only the machine that ran the command knows.
 *
 * Both are optional because a live run may name neither: `sherlo mask` folds whatever it was told
 * about and invents nothing. An empty string is not a path and is ignored - folding one would
 * splice a placeholder between every character of the screen.
 */
export type MaskContext = {
  /** The project folder the run read - a temporary directory on the pose road. */
  projectRoot?: string;
  /** The config file path the run resolved, which sits INSIDE the project root. */
  configPath?: string;
};

/**
 * Fold every volatile class out of one screen.
 *
 * Pure: text in, text out. The order below is the order the book page lists the classes in, and
 * it is load-bearing in three places - the machine paths go first because every other class may
 * sit inside one, a native build's PATH is folded before its bare NAME, and the wait's progress
 * region is collapsed before the closers under it are folded.
 */
export function maskScreen(screen: string, context: MaskContext): string {
  let folded = foldMachinePaths(screen, context);

  folded = foldTokens(folded);
  folded = foldBuildUrl(folded);
  folded = foldProjectIndex(folded);
  folded = foldTeamId(folded);
  folded = foldMintedProjectToken(folded);
  folded = foldByteSize(folded);
  folded = foldTimeAgo(folded);
  folded = foldBaseFingerprint(folded);
  folded = foldWaitProgress(folded);
  folded = foldTimeoutMinutes(folded);
  folded = foldAuthFailureStatus(folded);
  folded = foldRunError(folded);
  folded = foldCommitSha(folded);
  folded = foldRunNamespace(folded);
  folded = foldAndroidBuild(folded);
  folded = foldIosBuild(folded);
  folded = foldCaptureSettleTime(folded);
  folded = foldCaptureScreenfuls(folded);
  folded = foldCaptureMeasuredSize(folded);
  folded = foldInstalledSdkVersion(folded);
  folded = stripTerminalArtifacts(folded);
  folded = stripTurboSnapDiagnostic(folded);

  return folded;
}

/**
 * `sherlo mask` - read a screen on stdin, print it folded on stdout, exit 0.
 *
 * THE CONTRACT THE TEST REPOSITORY CONSUMES, and deliberately the smallest one that can carry a
 * live run's screen: stdin in, folded text out, the two paths that run knew as flags. It prints
 * byte for byte what {@link applyMasks} would have produced for the same screen, because both go
 * through {@link maskScreen} and nothing else in this tool folds anything.
 */
export function mask(context: MaskContext): void {
  process.stdout.write(maskScreen(readStdin(), context));
  process.exit(0);
}

export default mask;

/**
 * The placeholders the tool already folds to, so a pose may not name them in its own `masks`.
 *
 * A pose that hand-types one of these is describing the masker rather than its scenario: the
 * class is folded by shape whether the pose asks or not, so the entry buys nothing and rots the
 * day the class moves. The catalogue law refuses it (./__tests__/masking.test.ts).
 */
export const CLASSES_THE_TOOL_FOLDS = [
  '<PROJECT_ROOT>',
  '<SHERLO_CONFIG_PATH>',
  '<MASKED>',
  '<APP_HOST>',
  '<TEAM>',
  '<PROJECT>',
  '<BUILD>',
  '<SIZE>',
  '<TIME_AGO>',
  '<FINGERPRINT>',
  '<N>',
  '<STATUS>',
  '<RUN_ERROR>',
  '<SHA>',
  '<SHERLO_ANDROID_BUILD_PATH>',
  '<SHERLO_ANDROID_BUILD_FILE_NAME>',
  '<SHERLO_IOS_BUILD_PATH>',
  '<SHERLO_IOS_BUILD_FILE_NAME>',
  '<SETTLED>',
  '<PARTS>',
  '<VERSION>',
];

/* ========================================================================== */
/* THE CLASSES, in the order the book page lists them.                        */
/* ========================================================================== */

/**
 * The two paths only this machine knows: the config file, then the project folder.
 *
 * THE CONFIG PATH GOES FIRST because it sits inside the project root, and folding the root first
 * would leave half a path behind.
 */
function foldMachinePaths(screen: string, { projectRoot, configPath }: MaskContext): string {
  let folded = configPath ? screen.split(configPath).join('<SHERLO_CONFIG_PATH>') : screen;
  if (projectRoot) folded = folded.split(projectRoot).join('<PROJECT_ROOT>');

  return folded;
}

/**
 * A token, wherever it appears.
 *
 * A credential reaches a screen through more doors than anybody remembers: the command line a
 * beat echoes, a config file printed back, an HTTP header a diagnostic dumped, and a bare token
 * in a sentence. Each door is matched on ITS OWN SHAPE rather than on a literal, so a token
 * nobody anticipated is folded the first time it is printed.
 *
 * EVERY PATTERN STOPS AT THE END OF ITS OWN LINE, spaces and tabs only: a `token:` with nothing
 * after it must fold nothing rather than reach down and eat the line below.
 *
 * A PROJECT TOKEN IS 40 CHARACTERS PLUS ITS PROJECT INDEX - 32 of api token, 8 of team id, then
 * the index in digits (../../helpers/getTokenParts). The length bound at the end is what keeps a
 * 64-character fingerprint out: a longer run of letters and digits has no word boundary where
 * this pattern needs one.
 */
function foldTokens(screen: string): string {
  return screen
    .replace(/(--(?:personal-)?token[ =])[^\s"'\u001b]+/g, '$1<MASKED>')
    .replace(/("?[A-Za-z]*[tT]oken"?:[ \t]*"?)[^\s",'\u001b]+/g, '$1<MASKED>')
    .replace(/(Authorization:[ \t]*(?:Basic|Bearer)[ \t]+)[^\s"'\u001b]+/g, '$1<MASKED>')
    .replace(/\bsht_[A-Za-z0-9]+/g, '<MASKED>')
    .replace(/\b[A-Za-z0-9]{40}\d{1,6}\b/g, '<MASKED>');
}

/**
 * A build's address: the host it lives on and the three ids that name it.
 *
 * ALL FOUR MOVE BETWEEN MACHINES - a test environment is not app.sherlo.io, and the team, project
 * and build a live run made are whatever the server handed out. So the whole address folds to one
 * canonical address rather than to a single placeholder, which keeps the line readable as the
 * link it is. A token that ever reaches the `t=` slot is already `<MASKED>` by the time this
 * runs, and folds on into `<TEAM>` with everything else.
 */
function foldBuildUrl(screen: string): string {
  return screen.replace(
    /https?:\/\/[^/\s\u001b]+\/build\?t=[^&\s\u001b]*&p=[^&\s\u001b]*&b=[^&\s\u001b]*/g,
    'https://<APP_HOST>/build?t=<TEAM>&p=<PROJECT>&b=<BUILD>'
  );
}

/** `projectIndex=1` - the index the server gave a project, printed for a script to read. */
function foldProjectIndex(screen: string): string {
  return screen.replace(/\bprojectIndex=\d+/g, 'projectIndex=<PROJECT>');
}

/** `teamId=tm000001` - the id the server gave a team. */
function foldTeamId(screen: string): string {
  return screen.replace(/\bteamId=[^\s,)\u001b]+/g, 'teamId=<TEAM>');
}

/**
 * The project token `sherlo project create` prints once, on the line under its own warning.
 *
 * FOLDED BY POSITION, not by shape, and that is the point: the whole reason this line exists is
 * that the value on it is never shown again, so it must be folded even when the server handed
 * back something that looks nothing like a token.
 */
function foldMintedProjectToken(screen: string): string {
  const lines = screen.split('\n');
  const warning = lines.findIndex((line) => visible(line).includes('shown once'));
  if (warning === -1) return screen;

  for (let line = warning + 1; line < lines.length; line += 1) {
    if (visible(lines[line]).trim() === '') continue;

    lines[line] = lines[line].replace(/[^\s\u001b]+/, '<MASKED>');
    break;
  }

  return lines.join('\n');
}

/**
 * A size in bytes, however the printer chose to scale it.
 *
 * THE UNIT FOLDS WITH THE NUMBER: the same binary reads `48.12 MB` here and `0.05 GB` on a
 * printer that scaled it differently, so a placeholder that kept the unit would still differ
 * between two runs of the same thing.
 */
function foldByteSize(screen: string): string {
  return screen.replace(/\b\d+(?:\.\d+)?\s(?:KB|MB|GB)\b/g, '<SIZE> MB');
}

/** How long ago something happened - `7 minutes ago`, and the `└─ created:` line's own time. */
function foldTimeAgo(screen: string): string {
  return screen
    .replace(/\b\d+\s(?:second|minute|hour|day|week|month|year)s?\sago\b/g, '<TIME_AGO>')
    .replace(/(└─ created:)[^\n\u001b]*/g, '$1 <TIME_AGO>');
}

/** `base-fingerprint=<64 hex>` - a digest over the project's native inputs. */
function foldBaseFingerprint(screen: string): string {
  return screen.replace(/\bbase-fingerprint=[0-9a-f]{64}\b/g, 'base-fingerprint=<FINGERPRINT>');
}

/**
 * Everything a `--wait` printed between its header and its closer, as one line.
 *
 * HOW MANY PROGRESS LINES A RUN PRINTS IS THE SERVER'S BUSINESS, not the scenario's: a build that
 * queued, then ran, then finished prints three, the same build on a quieter day prints one, and a
 * pose of that road prints exactly one. So the whole region collapses to a single line and the
 * count stops being evidence about anything.
 *
 * THE REGION ENDS AT THE FIRST BLANK LINE, which is how the wait loop frames its closer - one
 * bare `console.log()` above it and one below (../../render/verdictCloser). A closer is therefore
 * never swallowed, and the deadline in the header above is left exactly as the pose declared it.
 */
function foldWaitProgress(screen: string): string {
  const lines = screen.split('\n');
  const header = lines.findIndex((line) => visible(line).includes('⏳ Waiting for build results'));
  if (header === -1) return screen;

  let afterRegion = header + 1;
  while (afterRegion < lines.length && visible(lines[afterRegion]).trim() !== '') afterRegion += 1;
  if (afterRegion === header + 1) return screen;

  return [
    ...lines.slice(0, header + 1),
    '   <build progress masked>',
    ...lines.slice(afterRegion),
  ].join('\n');
}

/**
 * The deadline the timed-out closer reports.
 *
 * NOT THE ONE IN THE HEADER ABOVE IT. The header prints the deadline the run was GIVEN, which is
 * a value the scenario declares and a reader checks; this line is reached only by a run whose
 * clock actually passed it, and a live run's clock is its own.
 */
function foldTimeoutMinutes(screen: string): string {
  return screen.replace(/(⏰ Timeout reached after )\d+( minutes\.)/g, '$1<N>$2');
}

/** The HTTP status behind a credential the server refused mid-poll (`🔒 ...`). */
function foldAuthFailureStatus(screen: string): string {
  return screen.replace(/(🔒[^\n]*?)\b\d{3}\b/g, '$1<STATUS>');
}

/**
 * The `runError` the infrastructure closer prints under its headline.
 *
 * Anchored to the headline above it, so the `TypeError:` a story threw while rendering - which is
 * the whole point of the screen that shows it - is never mistaken for this one.
 */
function foldRunError(screen: string): string {
  return screen.replace(/(❌ Build ended in[^\n]*\n[^\n]*?Error: )[^\n\u001b]*/g, '$1<RUN_ERROR>');
}

/** A commit id: forty hex characters and no more - a longer run is a digest, not a commit. */
function foldCommitSha(screen: string): string {
  return screen.replace(/\b[0-9a-f]{40}\b/g, '<SHA>');
}

/**
 * The run namespace a test repository puts in the branches it creates - `e2e/1758700000000-ab12/`.
 *
 * ONLY THE NAMESPACE, and only when it is stamped from a clock. The rest of the branch name is
 * the scenario's own word (`e2e/<run>/dev`), and a branch like `feature/checkout` is a value a
 * pose declares and this must never touch.
 */
function foldRunNamespace(screen: string): string {
  return screen.replace(/\be2e\/\d{6,}(?:-[A-Za-z0-9]+)?\//g, 'e2e/<run>/');
}

/** The Android build a push was handed: where it sat, and what it was called. */
function foldAndroidBuild(screen: string): string {
  return foldNativeBuild(screen, ['.apk'], {
    path: '<SHERLO_ANDROID_BUILD_PATH>',
    fileName: '<SHERLO_ANDROID_BUILD_FILE_NAME>',
  });
}

/** The iOS build a push was handed, the same way (../../constants, `IOS_FILE_TYPES`). */
function foldIosBuild(screen: string): string {
  return foldNativeBuild(screen, ['.tar.gz', '.tar', '.app'], {
    path: '<SHERLO_IOS_BUILD_PATH>',
    fileName: '<SHERLO_IOS_BUILD_FILE_NAME>',
  });
}

/** Anything a path may be made of: not whitespace, not a quote, not an escape sequence. */
const PATH_CHARACTER = `[^\\s"'\`${ESCAPE}]`;

/** Anything a bare file NAME may be made of: a path character, and never the separator itself. */
const NAME_CHARACTER = `[^\\s"'\`/${ESCAPE}]`;

/**
 * A native build named on a command line or on a screen.
 *
 * THE PATH GOES FIRST AND THE BARE NAME SECOND, because a path ENDS in the name: folding the name
 * first would leave a directory with a placeholder stuck on the end of it. The longer extensions
 * are tried before the shorter ones for the same reason (`.tar.gz` before `.tar`).
 */
function foldNativeBuild(
  screen: string,
  extensions: string[],
  placeholder: { path: string; fileName: string }
): string {
  let folded = screen;

  for (const extension of extensions) {
    const named = `${escapeForPattern(extension)}\\b`;

    folded = folded
      .replace(new RegExp(`${PATH_CHARACTER}*/${PATH_CHARACTER}*${named}`, 'g'), placeholder.path)
      .replace(new RegExp(`${NAME_CHARACTER}+${named}`, 'g'), placeholder.fileName);
  }

  return folded;
}

/** How long a story took to stop changing - the device's answer, never the scenario's. */
function foldCaptureSettleTime(screen: string): string {
  return screen.replace(/(settled in )\d+(?:\.\d+)?s\b/g, '$1<SETTLED>');
}

/** How many screenfuls a story needed - what it scrolled past, measured on the device. */
function foldCaptureScreenfuls(screen: string): string {
  return screen.replace(/(captured in )\d+( screenfuls)/g, '$1<PARTS>$2');
}

/**
 * A view's measured size, as the inspector draws it after the opening tag: `(360 x 800)`.
 *
 * MEASURED, NOT DECLARED: the same story lays out to different points on different devices and
 * different font scales, so a size that reached a transcript would make the transcript a fact
 * about the machine that recorded it rather than about the story.
 */
function foldCaptureMeasuredSize(screen: string): string {
  return screen.replace(/\(\d+(?:\.\d+)? x \d+(?:\.\d+)?\)/g, '(<SIZE>)');
}

/** The SDK version `sherlo init` installs - a published number, a local tarball, whatever it is. */
function foldInstalledSdkVersion(screen: string): string {
  return screen.replace(/(@sherlo\/react-native-storybook)@[^\s"'`\u001b]+/g, '$1@<VERSION>');
}

/**
 * The terminal artifacts a live run leaves and a single-instant transcript never should.
 *
 * A SPINNER REDRAWS ITSELF. Between hiding the cursor and showing it again it writes one frame
 * per tick, each over the last, and which frame a reader ends up with is whichever the machine
 * happened to reach - a fast machine and a loaded one leave different bytes for the same run. The
 * whole span goes, because the line the spinner succeeds into says everything the frames said.
 * The lone show-cursor escape a process leaves on its way out goes with it.
 */
function stripTerminalArtifacts(screen: string): string {
  return screen
    .replace(new RegExp(`${ESCAPE}\\[\\?25l[\\s\\S]*?${ESCAPE}\\[\\?25h`, 'g'), '')
    .replace(new RegExp(`${ESCAPE}\\[\\?25[lh]`, 'g'), '');
}

/** The bundler's TurboSnap diagnostic - a whole line, and one this tool never prints itself. */
function stripTurboSnapDiagnostic(screen: string): string {
  return screen.replace(/^\[Sherlo\] TurboSnap:.*\n?/gm, '');
}

/* ========================================================================== */

/** One line with its colour taken off, for the three classes that read a line's words. */
function visible(line: string): string {
  return line.replace(new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, 'g'), '');
}

/** An extension is a literal, and `.` means something else to a pattern. */
function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Read the whole of stdin, for `sherlo mask`. */
function readStdin(): string {
  return fs.readFileSync(0, 'utf8');
}
