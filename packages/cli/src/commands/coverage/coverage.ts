/**
 * `sherlo coverage` - list every component no story file imports, most imported first. With
 * `--props`, also list the prop values no story file sets.
 *
 * The road is ../../seams/coverageScan. It reads the app's own source files and TypeScript types:
 * no bundler, no phone. A prop value counts as covered when a story file sets it for its own
 * component - in the meta's or a story's `args`, or written as a prop on that component inside the
 * story file; a helper in another file is not followed. Nothing here talks to Sherlo's backend or
 * needs a token.
 *
 * AN AGENT IS A FIRST-CLASS CALLER, so `--json` prints the same data the screen shows. Gaps are
 * the developer's news, not the tool's failure, so a scan that came back exits 0.
 */
import { JSON_OPTION, PROPS_OPTION } from '../../constants';
import { emit } from '../../helpers/transcriptSink';
import { coverageScan } from '../../seams/coverageScan';
import { rankGaps } from './componentGaps';

export type CoverageOptions = {
  [PROPS_OPTION]?: boolean;
  [JSON_OPTION]?: boolean;
};

async function coverage(passedOptions: CoverageOptions): Promise<void> {
  const findings = rankGaps(
    await coverageScan().scan({ withProps: passedOptions[PROPS_OPTION] === true })
  );

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  } else {
    emit({ kind: 'coverage', screen: { findings } });
  }
}

export default coverage;
