/**
 * `sherlo suggest` - what to test next, ranked from the app's code and git history alone.
 *
 * ZERO CONFIG, and no token. Files come from ../../seams/coverageScan (the same reader as
 * `sherlo coverage`); the variants a story lacks come from `coverage --props`' reader
 * (../coverage/storyPropValues) when the app has TypeScript. See ./suggestItems for the ranking.
 * `--facts <file>` prints what to know to write the test of one screen (./screenFacts).
 */
import path from 'path';
import { ALL_OPTION, DIR_OPTION, FACTS_OPTION, JSON_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import { openAppTypes, readAppFiles } from '../../seams/coverageScan';
import { storyPropValues } from '../coverage/storyPropValues';
import { gitHistory } from './gitHistory';
import { factsFileOf, factsLines, screenFacts } from './screenFacts';
import { scenesOn } from '../../helpers/sceneOptions';
import { suggestItems, topOfEachKind, type SuggestItem } from './suggestItems';

export type SuggestOptions = {
  [DIR_OPTION]?: string;
  [ALL_OPTION]?: boolean;
  [FACTS_OPTION]?: string;
  [JSON_OPTION]?: boolean;
};

const TOP = 10;

async function missingVariants(
  root: string,
  files: Awaited<ReturnType<typeof readAppFiles>>['files']
): Promise<Map<string, string>> {
  const variants = new Map<string, string>();
  try {
    const types = await openAppTypes(root);
    try {
      for (const component of storyPropValues({ files, types }).components) {
        for (const prop of component.props) {
          const value = prop.missing?.[0];
          if (value === undefined) continue;
          variants.set(component.file, value === 'true' ? prop.prop : `${prop.prop}=${value}`);
          break;
        }
      }
    } finally {
      types.close();
    }
  } catch {
    // No TypeScript in the app: no variant is suggested.
  }
  return variants;
}

/** The name column: an item the rules could not settle shows `?` after its name. */
const nameOf = (item: SuggestItem): string => (item.unsure ? `${item.name} ?` : item.name);

function line(rank: number, item: SuggestItem, widths: { name: number; file: number }): string {
  return (
    `${String(rank).padStart(2)} ${item.kind.padEnd(5)}  ${nameOf(item).padEnd(widths.name)}  ` +
    `${item.file.padEnd(widths.file)}  ${item.unsure ? `unsure: ${item.unsure}` : item.reason}`
  );
}

async function suggest(passedOptions: SuggestOptions): Promise<void> {
  const root = path.resolve(passedOptions[DIR_OPTION] ?? getCwd());
  const { files, tsconfig } = await readAppFiles(root);

  const factsFile = passedOptions[FACTS_OPTION];
  if (factsFile) {
    const facts = screenFacts({ files, tsconfig, file: factsFileOf(root, factsFile) });
    if (!facts) {
      throwError({
        message: `${factsFile} is not a component file of the app in ${root}: run \`npx sherlo suggest\` to list the files to ask about.`,
      });
      return;
    }
    process.stdout.write(
      passedOptions[JSON_OPTION]
        ? `${JSON.stringify(facts, null, 2)}\n`
        : `${factsLines(facts).join('\n')}\n`
    );
    return;
  }

  const [{ history, shallow }, variants] = await Promise.all([
    gitHistory(root),
    missingVariants(root, files),
  ]);
  const result = suggestItems({ files, tsconfig, history, variants, scenes: scenesOn() });

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify({ ...result, shallow }, null, 2)}\n`);
    return;
  }

  const shown = passedOptions[ALL_OPTION] ? result.items : topOfEachKind(result.items, TOP);
  const widths = {
    name: Math.max(0, ...shown.map((item) => nameOf(item).length)),
    file: Math.max(0, ...shown.map((item) => item.file.length)),
  };
  const lines = ['', 'Test next', ...shown.map((item, index) => line(index + 1, item, widths)), ''];
  if (shallow) lines.push('history may be cut: shallow clone');
  lines.push(
    `Skipped ${result.wrappers} ${result.wrappers === 1 ? 'wrapper' : 'wrappers'}. ` +
      `${result.tested} already tested.`
  );
  if (shown.length < result.items.length) lines.push('More: npx sherlo suggest --all');
  process.stdout.write(`${lines.join('\n')}\n`);
}

export default suggest;
