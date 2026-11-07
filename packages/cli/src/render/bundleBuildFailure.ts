/**
 * WHAT `sherlo capture` PRINTS WHEN THE BUNDLER CANNOT BUILD THE APP'S CODE.
 *
 * Pure, like everything under ./: the failure the bundler reported in, lines out. A story capture
 * and a scene capture print it the same way, so the app never started and neither has a view to draw.
 */
import chalk from 'chalk';

/** Why the app's code did not build, as the bundler reported it. */
export type BundleBuildFailure = {
  kind: 'unresolved-import' | 'syntax' | 'other';
  /** The bundler's own words: what went wrong, without its code frame. */
  message: string;
  /** The file the bundler names, relative to the project root when it lies under it. */
  file?: string;
  line?: number;
  column?: number;
  /** The few source lines around the failure, as the bundler's code frame shows them. */
  frame?: string[];
  /** For an unresolved import: the path as the import writes it. */
  importPath?: string;
  /** For an unresolved import the type check resolves: how (`baseUrl "src"`, `paths "@app/*"`). */
  knownToTheTypeCheck?: string;
};

/**
 * The app's code did not build: the file, line and message the bundler gave, its code frame, and -
 * for an import the type check resolves and the bundler does not - why the two disagree, with the
 * fix.
 */
export function bundleBuildFailureLines(failure: BundleBuildFailure): string[] {
  const place = failure.file
    ? [failure.file, failure.line, failure.line !== undefined ? failure.column : undefined]
        .filter((part) => part !== undefined)
        .join(':')
    : undefined;

  return [
    `${chalk.red('✖')}  The bundler cannot build the app's code, so no app can start`,
    '',
    ...(place ? [`  ${chalk.bold(place)}`] : []),
    `  ${failure.message}`,
    ...(failure.frame && failure.frame.length > 0
      ? ['', ...failure.frame.map((line) => chalk.dim(`    ${line}`))]
      : []),
    '',
    ...(failure.knownToTheTypeCheck && failure.importPath
      ? [
          `  tsconfig.json resolves ${chalk.bold(failure.importPath)} (${failure.knownToTheTypeCheck}), so the type check passes. Metro does not read tsconfig.json.`,
          '  Teach Metro the same path (resolver.extraNodeModules in metro.config.js, or a Babel alias plugin) or import it relative.',
          '',
        ]
      : []),
    chalk.dim('Fix the file, then capture again. Metro printed the same error where it runs.'),
    '',
  ];
}
