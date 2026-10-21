/**
 * WHAT `sherlo coverage` PRINTS.
 *
 * Pure, like everything under ./: state in, lines out. The scan that produces the state reads the
 * app's own source files, and with `--props` walks the stories on the running app
 * (../seams/coverageScan); a posed run states the findings and a real run reads them, and neither
 * changes a line of what is printed.
 *
 * THE SHAPE IS A LINT REPORT'S. One line is one component with its file, the ones the most files
 * import first, aligned like `npm outdated`; a count in the heading, never a percentage; and one
 * dim line naming the next step. EVERY GAP IS LISTED - a cut-off list would hide the answer.
 *
 * The refusals for `--props` are word for word the ones `sherlo capture` prints, because they are
 * the same facts about the same road (see ./capturedStory).
 */
import chalk from 'chalk';
import { renderCapturedStory } from './capturedStory';

/** A component that no story file imports directly. */
export type CoverageGap = {
  name: string;
  /** Where the component lives, relative to the project folder. */
  file: string;
  /** How many of the app's own files import it. */
  importedBy: number;
  /** True when the only story that imports it is marked `sherlo: { exclude: true }`. */
  excluded?: true;
};

/** One prop of one component, against the finite values its TypeScript type allows. */
export type PropFinding = {
  prop: string;
  /** How many values the type allows. */
  allowed: number;
  /** How many of them some story drew. */
  drawn: number;
  /** The values no story drew, by name. Stated only for a prop with at most 10 allowed values. */
  missing?: string[];
};

/** A component of the app and the props of it whose values some story never drew. */
export type ComponentProps = {
  name: string;
  file: string;
  props: PropFinding[];
};

/** What walking every story on the running app found. */
export type CoverageProps = {
  stories: number;
  /** The device the stories were drawn on. */
  device: string;
  components: ComponentProps[];
};

/** Everything a scan found. */
export type CoverageFindings = {
  /** How many components the app has. */
  components: number;
  /** The components no story imports, ranked: the most imported first. */
  gaps: CoverageGap[];
  /** Present only when `--props` walked the stories. */
  props?: CoverageProps;
};

/** How a run of `sherlo coverage` ended, as the screen needs it. */
export type CoverageScreen =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | { kind: 'scanned'; findings: CoverageFindings };

/** A prop with more allowed values than this shows a count, not the missing names. */
export const MAX_NAMED_VALUES = 10;

const NEXT_STEP = 'Next: write a story, then check it with `npx sherlo capture --story <id>`.';
const PROPS_HINT = '`--props` also lists the prop values no story drew, with the app running.';
const EXCLUDED_HINT = 'excluded: only a story marked `sherlo: { exclude: true }` imports it.';

/** Every line `sherlo coverage` prints, in order. */
export function renderCoverage(screen: CoverageScreen): string[] {
  // The two refusals are capture's own screens.
  if (screen.kind !== 'scanned') return renderCapturedStory(screen);

  const { findings } = screen;
  return [...renderGaps(findings), ...(findings.props ? renderProps(findings.props) : [])];
}

function renderGaps({ components, gaps, props }: CoverageFindings): string[] {
  if (gaps.length === 0) {
    return [`${chalk.green('✔')}  All ${components} components have a story of their own`, ''];
  }

  const nameWidth = Math.max(...gaps.map((gap) => gap.name.length));
  const fileWidth = Math.max(...gaps.map((gap) => gap.file.length));
  const rows = gaps.map((gap) => {
    const files = `${gap.importedBy} ${gap.importedBy === 1 ? 'file imports' : 'files import'} it`;
    return [
      `  ${gap.name.padEnd(nameWidth)}`,
      chalk.dim(gap.file.padEnd(fileWidth)),
      files.padStart('00 files import it'.length),
      ...(gap.excluded ? [chalk.yellow('excluded')] : []),
    ].join('  ');
  });

  return [
    `${chalk.yellow('◦')}  ${chalk.bold(
      `Components with no story of their own: ${gaps.length} of ${components}`
    )}`,
    '',
    ...rows,
    '',
    chalk.dim(NEXT_STEP),
    ...(gaps.some((gap) => gap.excluded) ? [chalk.dim(EXCLUDED_HINT)] : []),
    ...(props ? [] : [chalk.dim(PROPS_HINT)]),
    '',
  ];
}

function renderProps({ stories, device, components }: CoverageProps): string[] {
  // A component whose every value was drawn has nothing to say.
  const lacking = components
    .map((component) => ({
      ...component,
      props: component.props.filter((finding) => finding.drawn < finding.allowed),
    }))
    .filter((component) => component.props.length > 0);

  const heading = `${chalk.yellow('◦')}  ${chalk.bold(
    `Prop values no story drew - ${stories} stories on ${device}`
  )}`;
  if (lacking.length === 0) return [heading, '', chalk.dim('Every allowed value was drawn.'), ''];

  const lines = [heading, ''];
  for (const component of lacking) {
    const propWidth = Math.max(...component.props.map((finding) => finding.prop.length));
    const countWidth = Math.max(...component.props.map((finding) => countOf(finding).length));

    lines.push(`  ${component.name}  ${chalk.dim(component.file)}`);
    for (const finding of component.props) {
      const named = finding.allowed <= MAX_NAMED_VALUES && finding.missing;
      lines.push(
        `    ${finding.prop.padEnd(propWidth)}  ${countOf(finding).padEnd(countWidth)}` +
          (named ? `  missing ${finding.missing?.join(', ')}` : '')
      );
    }
    lines.push('');
  }

  return lines;
}

/** `1 of 6 drawn`: the same words for a prop that names its missing values and one that does not. */
function countOf({ drawn, allowed }: PropFinding): string {
  return `${drawn} of ${allowed} drawn`;
}
