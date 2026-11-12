/**
 * The fold for the app bundle step: the lines a run prints before its test opens.
 */
import { visible } from './maskPatterns';

/** The one text both roads fold to. */
const APP_BUNDLE_STEP = '<APP_BUNDLE_STEP>';

/** A platform's own line of the push road: `🤖 Android  Bundling the JavaScript...`, then its `✔ Reused` row. */
const PUSH_ROAD_LINE =
  /^(?:🤖 Android|🍎 iOS) +(?:Bundling the JavaScript\.\.\.|[✔✖] (?:Reused|Bundled)\b.*)$/;

const BUNDLING_LINE = /^(?:🤖 Android|🍎 iOS) +Bundling the JavaScript\.\.\.$/;

/** The sim road's header and its upload lines, which only a test run prints. */
const SIM_HEADER = /^🧪 Sim mode: /;
const SIM_UPLOAD = /^⬆️ +Uploading \S+ sim world \+ manifest\.\.\.$/;

/**
 * The app bundle step, folded to one line on both roads.
 *
 * A customer's run bundles the JavaScript and then prints a row per platform with its result word
 * (Reused, Reused from Test 1, Bundled); a test's run against a declared world prints the sim
 * opening instead. The wording differs and the scenario does not, so each folds to
 * `<APP_BUNDLE_STEP>`, and the blank line that spaces the push road's block goes with it.
 */
export function foldAppBundleStep(screen: string): string {
  const lines = screen.split('\n');
  const folded: string[] = [];

  let at = 0;
  while (at < lines.length) {
    if (PUSH_ROAD_LINE.test(visible(lines[at]))) {
      let end = at;
      while (end < lines.length && PUSH_ROAD_LINE.test(visible(lines[end]))) end += 1;
      // Only a block that opens with the bundling is the step: the same rows under a test's row
      // (a platform reused, another built) are the scenario's own and stay.
      if (!BUNDLING_LINE.test(visible(lines[at]))) {
        folded.push(...lines.slice(at, end));
        at = end;
        continue;
      }
      if (end < lines.length && visible(lines[end]) === '') end += 1;
      folded.push(APP_BUNDLE_STEP);
      at = end;
    } else if (SIM_HEADER.test(visible(lines[at]))) {
      // The blank bold line the header's own newline prints belongs to the block.
      if (folded.length > 0 && visible(folded[folded.length - 1]) === '') folded.pop();
      let end = at + 1;
      while (
        end < lines.length &&
        (visible(lines[end]) === '' || SIM_UPLOAD.test(visible(lines[end])))
      ) {
        end += 1;
      }
      folded.push(APP_BUNDLE_STEP);
      at = end;
    } else {
      folded.push(lines[at]);
      at += 1;
    }
  }

  return folded.join('\n');
}
