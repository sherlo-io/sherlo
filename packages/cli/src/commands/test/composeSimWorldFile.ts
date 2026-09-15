/**
 * THE SEAM WITH THE EXECUTOR: fold a declared world TREE into the single JSON
 * document the API's sim executor reads (sim-mode design section 2).
 *
 * The tree is the CLI's format - it exists so a developer can edit one module
 * without touching another, and so git can merge two such edits. The executor
 * has no interest in any of that: it wants one object with `modules`, a flat
 * `stories` list and a `run`. So the split lives ENTIRELY on this side of the
 * wire, and the API's `parseSimWorld` is untouched by it.
 *
 * That is also what fixes a defect the split would otherwise have multiplied.
 * The world used to be parsed independently by the CLI and by the API, and the
 * two schemas had drifted - a world spelled the way the CLI's own type
 * documented it (`run.outcome: { storyErrors: [...] }`) passed `sherlo test`
 * and then KILLED the build inside the executor, which accepts only a string
 * outcome and reads story errors from a sibling `run.storyErrors`. With the
 * on-disk format CLI-only and the wire format API-only, there is one producer
 * and one consumer instead of two parsers of one file. Every rule the executor
 * enforces is enforced here first (./simWorld validates the outcome against the
 * API's own `SimRunOutcome`, and a `render.bg` against the API's hex form), so
 * a world that passes the CLI cannot be refused by the executor.
 *
 * WHAT MOVES ACROSS, and what stays behind:
 *
 * - `modules` becomes the flat path -> content map the executor validates. The
 *   modules' import EDGES stay behind: the executor never reads them, and the
 *   closure they feed is the CLI's to compute (./deriveSimManifest).
 * - each module's stories become entries in one `stories` array, each carrying
 *   the `file` it was declared in - which on this side is a field, and on the
 *   tree side was the file's own path.
 * - a story's `error` becomes an entry in `run.storyErrors`, which is the only
 *   spelling the executor accepts. On the tree side the flag sits on the story
 *   itself, so declaring one takes no edit to a shared file.
 *
 * Serialization is the CLI's stableStringify, so equal worlds upload
 * BYTE-IDENTICAL bytes however the tree was walked.
 */
import stableStringify from '../../helpers/stableStringify';
import type { SimWorld } from './simWorld';

/**
 * The world document the executor reads. Named after `parseSimWorld`'s input
 * rather than after its output: `@sherlo/api-types`' `SimWorld` describes the
 * world AFTER the executor has filled its defaults in (`name` already composed
 * into a display name), which is not what a producer writes.
 */
type SimWorldFileContents = {
  simVersion: number;
  modules: Record<string, string>;
  stories: {
    id: string;
    file: string;
    title?: string;
    name?: string;
    render: { text: string; bg: string };
  }[];
  run: { outcome: string; storyErrors: string[] };
};

/** Fold the tree into the bytes uploaded for the executor. */
function composeSimWorldFile(world: SimWorld): Buffer {
  const modules: Record<string, string> = {};
  const stories: SimWorldFileContents['stories'] = [];
  const storyErrors: string[] = [];

  for (const module of world.modules) {
    modules[module.path] = module.content;

    for (const story of module.stories) {
      stories.push({
        id: story.id,
        file: module.path,
        ...(story.title !== undefined ? { title: story.title } : {}),
        ...(story.name !== undefined ? { name: story.name } : {}),
        render: { text: story.render.text, bg: story.render.bg },
      });

      if (story.error) storyErrors.push(story.id);
    }
  }

  const contents: SimWorldFileContents = {
    simVersion: world.simVersion,
    modules,
    stories,
    run: { outcome: world.run.outcome, storyErrors },
  };

  return Buffer.from(stableStringify(contents), 'utf8');
}

export default composeSimWorldFile;
