/**
 * A TERMINAL OR A LOG - the one check that decides it, and the one way a long step shows while it
 * runs (epic sherlo-test-builds-apps, operator decisions 2026-10-12).
 *
 * A person at a terminal sees a long step as a spinner, and the spinner is stopped before the
 * step's `✔` line, so the terminal keeps only the `✔` lines. Anywhere else - a CI log, an agent's
 * shell, Expo's build log - nothing can be redrawn, so the step prints its words once, as one plain
 * line, and keeps them. An agent reads exactly what a CI log holds: there is no third reader.
 *
 * ONE CHECK, for every spinner and every progress line `sherlo test`, `sherlo build`, `sherlo view`
 * and the EAS hook show, and for whether they open with the logo. It replaces the three different
 * guesses the CLI made (`stdout.isTTY`, `stderr.isTTY`, and ora's own); `sherlo init` and
 * `sherlo login` move onto it once init-for-agents has merged (its named build debt).
 */
import { renderStepInProgress, type StepInProgress } from '../../render/stepInProgress';
import printSherloIntro from '../../helpers/printSherloIntro';
import spinner from '../../helpers/spinner';
import { emit } from '../../helpers/transcriptSink';

/**
 * True for a person's terminal: both streams are one (a spinner draws on stderr while the steps
 * print on stdout, so a terminal with either piped away is a log), the terminal can redraw (`TERM`
 * is not `dumb`), and no CI service says it is running the command (`CI`, which every CI service
 * sets, including Expo's builders, even where they give the command a terminal).
 */
export function printsToATerminal(): boolean {
  return (
    Boolean(process.stdout.isTTY) &&
    Boolean(process.stderr.isTTY) &&
    process.env.TERM !== 'dumb' &&
    !process.env.CI
  );
}

/**
 * The logo and tagline open a run only in a terminal (operator ruling 2026-10-12, Q1): a log - a
 * CI job, an agent's shell, Expo's build log - starts at the line that says what the command does.
 * `sherlo init` and `sherlo login` keep theirs until init-for-agents has merged.
 */
export function printTheLogoInATerminal(): void {
  if (printsToATerminal()) printSherloIntro();
}

/**
 * Do `work` while showing `step`: a spinner in a terminal, stopped when the work ends however it
 * ends, so whatever prints next takes its place; anywhere else the step's one plain line, printed
 * before the work starts.
 */
export async function whileShowing<Result>(
  step: StepInProgress,
  work: () => Promise<Result>
): Promise<Result> {
  if (!printsToATerminal()) {
    emit(step);
    return work();
  }

  // Enabled outright: whether this is a terminal was just decided, and ora's own guess differs.
  const shown = spinner({ text: renderStepInProgress(step), isEnabled: true }).start();
  try {
    return await work();
  } finally {
    shown.stop();
  }
}
