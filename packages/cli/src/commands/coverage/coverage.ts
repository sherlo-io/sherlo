/**
 * `sherlo coverage` - list every component no story file imports, most imported first. With
 * `--props`, also open every story on the running app and list the prop values none of them drew.
 *
 * The road is ../../seams/coverageScan. Without `--props` nothing is running: the scan reads the
 * app's own source files. Nothing here talks to Sherlo's backend or needs a token.
 *
 * AN AGENT IS A FIRST-CLASS CALLER, so `--json` prints the same data the screen shows. The exit
 * code says the one thing a caller branches on: whether a scan came back. Gaps are the developer's
 * news, not the tool's failure, so they exit 0.
 */
import { DEFAULT_BUNDLER_PORT, JSON_OPTION, PORT_OPTION, PROPS_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { coverageScan } from '../../seams/coverageScan';
import type { CoverageResult } from '../../seams/coverageScan';
import type { CoverageScreen } from '../../render/coverage';

export type CoverageOptions = {
  [PROPS_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
};

async function coverage(passedOptions: CoverageOptions): Promise<void> {
  const port = readPort(passedOptions[PORT_OPTION]);

  const answer = rankGaps(
    await coverageScan().scan({ port, withProps: passedOptions[PROPS_OPTION] === true })
  );

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  } else {
    emit({ kind: 'coverage', screen: screenFor(answer, port) });
  }

  if (answer.kind !== 'scanned') process.exit(EXIT_BLOCK);
}

export default coverage;

/* ========================================================================== */

/** The gaps the most files import first; the same count in name order, so a run repeats itself. */
export function rankGaps(answer: CoverageResult): CoverageResult {
  if (answer.kind !== 'scanned') return answer;

  const gaps = [...answer.findings.gaps].sort(
    (a, b) => b.importedBy - a.importedBy || a.name.localeCompare(b.name)
  );
  return { kind: 'scanned', findings: { ...answer.findings, gaps } };
}

/** What the screen shows for what the scan answered. */
export function screenFor(answer: CoverageResult, port: number): CoverageScreen {
  switch (answer.kind) {
    case 'no-bundler':
      return { kind: 'no-bundler', port };
    case 'no-app':
      return { kind: 'no-app', port };
    case 'scanned':
      return { kind: 'scanned', findings: answer.findings };
  }
}

function readPort(passed: string | undefined): number {
  if (passed === undefined) return DEFAULT_BUNDLER_PORT;

  const port = Number(passed);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throwError({
      message: `\`--${PORT_OPTION}\` takes a port number, and \`${passed}\` is not one.`,
    });
  }

  return port;
}
