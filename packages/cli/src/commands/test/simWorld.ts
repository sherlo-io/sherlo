/**
 * THE SIM WORLD - the declared app a sim-mode run tests instead of a real one
 * (sim-mode design section 1).
 *
 * The world is a SOURCE TREE, not a file. `sim-world/` holds one JSON file per
 * "source file" of the pretend app, at the path that module occupies:
 *
 *   sim-world/world.json                                    the app's own config
 *   sim-world/src/components/Storefront/ProductCard.tsx.json
 *   sim-world/src/components/Storefront/ProductCard.stories.tsx.json
 *
 * A module file declares what a BUNDLER would observe about that module - its
 * content, and the modules it imports - and, when it is a story file, the
 * stories it registers and what each of them draws. `world.json` declares what
 * a DEVICE would observe about the run as a whole: how it ends.
 *
 * ── WHY A TREE AND NOT ONE FILE ──────────────────────────────────────────────
 *
 * Because composition is git's job. The world used to be a single
 * `sim-world.json` carrying every module, so two branches touching COMPLETELY
 * DIFFERENT components rewrote the same blob: git could not merge them, one
 * silently won, and the fixtures grew hand-authored "combined" variants whose
 * only purpose was to re-state a merge git should have produced. One file per
 * module makes a branch's diff read like the source change it stands for, and
 * makes merging it the same operation a real team's merge is.
 *
 * ── WHY THE BYTES ARE CANONICAL, AND WHY THAT IS NOT A STYLE RULE ────────────
 *
 * Mergeability is a property of the BYTES, so this format owns them. Every file
 * in the tree must be spelled exactly as {@link formatSimModuleFile} /
 * {@link formatSimWorldConfig} would spell it, and a file that is not is
 * REFUSED naming itself. Two rules do the work:
 *
 *   1. One value per line, in a fixed key order. A value nobody touched is a
 *      line nobody touched.
 *   2. A BLANK LINE between siblings - after every line that ends in a comma.
 *      Git conflicts on changed lines that merely TOUCH, so two branches
 *      editing neighbouring fields of one story (the copy, and the ground it
 *      sits on) would collide without one. The blank line is what makes them
 *      merge, and it is emitted for EVERY sibling pair, including fields this
 *      format does not have yet.
 *
 * Rule 2 is the whole reason the check exists. It was previously honoured by
 * hand, in one story of one fixture, by spelling that story's `render` across
 * five lines - a convention nobody could see, that a single re-serialization
 * would have silently deleted along with the merge it was protecting.
 *
 * ── VALIDATION ───────────────────────────────────────────────────────────────
 *
 * STRICT and readable, the opposite of the module-manifest reader's bail-open
 * contract: a world is a hand-written fixture, so every problem is reported at
 * once, each naming the offending file/story/field, and the run refuses. There
 * is no build to degrade to - the world IS the app.
 */
import fs from 'fs';
import path from 'path';
import { SIM_WORLD_VERSION, type SimRunOutcome } from '@sherlo/api-types';
import { DEFAULT_PROJECT_ROOT } from '../../constants';
import throwError from '../../helpers/throwError';

/** The world tree `sherlo test` auto-detects in the project root. */
export const SIM_WORLD_DIRNAME = 'sim-world';

/** The world's own config, at the root of the tree. */
export const SIM_WORLD_CONFIG_FILENAME = 'world.json';

/** What a module file's name adds to the module path it stands for. */
export const SIM_MODULE_FILE_SUFFIX = '.json';

/** The run outcomes the API's executor understands, in the API's own spelling. */
const RUN_OUTCOMES: SimRunOutcome[] = ['crash-on-launch', 'ok', 'system-error'];

/** The one colour form the API's `parseSimWorld` accepts for a story's ground. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type SimStory = {
  /** Storybook-style story id, unique across the world. */
  id: string;
  /** Storybook title of the file's stories, e.g. `Storefront/ProductCard`. */
  title?: string;
  /** This story's own name within that title, e.g. `Basic`. Defaults to the id. */
  name?: string;
  /**
   * The story throws when the device renders it. Present only when true - what
   * a device OBSERVES, declared where the story is, not in a list elsewhere.
   */
  error?: true;
  /** What the sim executor draws - centered text on a solid ground. */
  render: { text: string; bg: string };
};

export type SimModule = {
  /** Normalized module path - where this file sits in the tree, minus `.json`. */
  path: string;
  /** The module's "source", a free string. */
  content: string;
  /** Normalized module paths this module imports DIRECTLY. Sorted. */
  imports: string[];
  /** The stories this module registers, sorted by id. Empty for a non-story module. */
  stories: SimStory[];
};

export type SimWorld = {
  simVersion: typeof SIM_WORLD_VERSION;
  /** Every module of the pretend app, sorted by path. */
  modules: SimModule[];
  /** How the run ends - what a device observes of the run as a whole. */
  run: { outcome: SimRunOutcome };
};

export type ValidatedSimWorld = {
  /** The world as the tree declares it, every path normalized (`./`-free posix). */
  parsed: SimWorld;
  /** Absolute path of the tree - for error messages and logs. */
  dirPath: string;
};

/**
 * Where this run's sim world lives, if anywhere: the explicit `--sim <path>`
 * wins, else a `sim-world/` sitting in the project root is auto-detected.
 * Returns undefined when neither applies - the run is not a sim run.
 */
export function resolveSimWorldPath(options: {
  sim?: string;
  projectRoot?: string;
}): { dirPath: string; explicit: boolean } | undefined {
  if (options.sim !== undefined) {
    return { dirPath: options.sim, explicit: true };
  }

  const detected = path.join(options.projectRoot || DEFAULT_PROJECT_ROOT, SIM_WORLD_DIRNAME);
  if (fs.existsSync(detected)) {
    return { dirPath: detected, explicit: false };
  }

  return undefined;
}

/**
 * Read and validate a sim world tree. Throws (via throwError) with EVERY
 * problem listed at once - a fixture author fixes the whole world in one pass.
 */
export function readSimWorld(dirPath: string): ValidatedSimWorld {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throwError({
      message:
        `The sim world at ${dirPath} is not a directory. A world is a source TREE - ` +
        `a ${SIM_WORLD_CONFIG_FILENAME} plus one \`<module path>${SIM_MODULE_FILE_SUFFIX}\` ` +
        'file per module.',
    });
  }

  const { world, problems } = validateSimWorldTree(readWorldTreeFiles(dirPath));
  if (!world) {
    throwError({
      message:
        `The sim world at ${dirPath} is invalid:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    });
  }

  return { parsed: world, dirPath };
}

/* ========================================================================== */

/** One file of a world tree, as it sits on disk. */
export type SimWorldFile = {
  /** Posix path relative to the tree root, e.g. `src/components/Hello.tsx.json`. */
  relativePath: string;
  /** The file's bytes, decoded as UTF-8. */
  text: string;
};

/**
 * Validate an already-read tree. Exposed for tests; collects every problem
 * instead of stopping at the first.
 */
export function validateSimWorldTree(
  files: SimWorldFile[]
): { world: SimWorld; problems: [] } | { world: null; problems: string[] } {
  const problems: string[] = [];

  const configFile = files.find((file) => file.relativePath === SIM_WORLD_CONFIG_FILENAME);
  if (!configFile) {
    return { world: null, problems: [`the world has no ${SIM_WORLD_CONFIG_FILENAME}`] };
  }

  const run = validateWorldConfig(configFile, problems);

  const modules: SimModule[] = [];
  for (const file of files) {
    if (file.relativePath === SIM_WORLD_CONFIG_FILENAME) continue;
    const module = validateModuleFile(file, problems);
    if (module) modules.push(module);
  }

  if (modules.length === 0) {
    problems.push('the world declares no modules');
  }
  modules.sort((a, b) => (a.path < b.path ? -1 : 1));

  checkImportTargetsExist(modules, problems);
  checkStoryIdsAreUnique(modules, problems);

  if (problems.length > 0 || !run) {
    return { world: null, problems };
  }

  return { world: { simVersion: SIM_WORLD_VERSION, modules, run }, problems: [] };
}

/**
 * Normalize a declared path to the `./`-free posix form the manifest must carry
 * (the server strips `./` and refuses `.`/`..` segments; emitting them here
 * would only invite a mismatch). Returns null with a reason when the path can
 * never be a valid manifest key.
 */
export function normalizeSimPath(declaredPath: string): string | { invalid: string } {
  if (declaredPath.includes('\\')) {
    return { invalid: 'contains a backslash - paths must be posix (`/`-separated)' };
  }
  if (declaredPath.startsWith('/')) {
    return { invalid: 'is absolute - paths must be project-relative' };
  }

  const normalized = declaredPath.startsWith('./') ? declaredPath.slice(2) : declaredPath;
  if (normalized === '') {
    return { invalid: 'is empty' };
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '')) {
    return { invalid: 'contains an empty path segment' };
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return { invalid: 'contains a `.` or `..` segment' };
  }

  return normalized;
}

/* ============================ canonical bytes ============================= */

/**
 * The one spelling of a JSON value this format accepts: two-space indentation,
 * one value per line, and a BLANK LINE after every line that ends a sibling -
 * see the header for why the blank line is the load-bearing half. Key order is
 * the caller's insertion order, which is what makes it a chosen order rather
 * than an alphabetical accident.
 */
export function formatCanonicalJson(value: unknown): string {
  const lines = JSON.stringify(value, null, 2).split('\n');
  const spaced: string[] = [];

  for (const line of lines) {
    spaced.push(line);
    // A line ending in a comma is a sibling that something else follows.
    if (line.endsWith(',')) spaced.push('');
  }

  return spaced.join('\n') + '\n';
}

/** The canonical bytes of one module file. */
export function formatSimModuleFile(module: SimModule): string {
  return formatCanonicalJson({
    content: module.content,
    ...(module.imports.length > 0 ? { imports: module.imports } : {}),
    ...(module.stories.length > 0
      ? {
          stories: module.stories.map((story) => ({
            id: story.id,
            ...(story.title !== undefined ? { title: story.title } : {}),
            ...(story.name !== undefined ? { name: story.name } : {}),
            ...(story.error ? { error: true } : {}),
            render: { text: story.render.text, bg: story.render.bg },
          })),
        }
      : {}),
  });
}

/** The canonical bytes of the world's own config. */
export function formatSimWorldConfig(world: Pick<SimWorld, 'simVersion' | 'run'>): string {
  return formatCanonicalJson({
    simVersion: world.simVersion,
    run: { outcome: world.run.outcome },
  });
}

/* ========================================================================== */

/**
 * Every file of the tree, posix-relative to its root, sorted for determinism.
 * Dot-entries are skipped: `.DS_Store` and friends are the checkout's, not the
 * world's, and refusing a run over one would be hostile. Everything else IS the
 * world, so a stray file is a problem the validator names.
 */
function readWorldTreeFiles(dirPath: string): SimWorldFile[] {
  const files: SimWorldFile[] = [];

  const walk = (absoluteDir: string, relativeDir: string): void => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;

      const absolute = path.join(absoluteDir, entry.name);
      const relative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;

      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else {
        files.push({ relativePath: relative, text: fs.readFileSync(absolute, 'utf8') });
      }
    }
  };

  walk(dirPath, '');
  files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));

  return files;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse one file, naming it in every problem it produces. */
function parseFileJson(
  file: SimWorldFile,
  problems: string[]
): Record<string, unknown> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch (error) {
    problems.push(
      `${file.relativePath} is not valid JSON ` +
        `(${error instanceof Error ? error.message : String(error)})`
    );
    return undefined;
  }

  if (!isPlainObject(value)) {
    problems.push(`${file.relativePath} must contain a JSON object`);
    return undefined;
  }

  return value;
}

/**
 * Refuse bytes the format's own writer would not have produced. This is what
 * turns "the files happen to merge" into "the files always merge" - see the
 * header.
 */
function checkCanonicalBytes(file: SimWorldFile, canonical: string, problems: string[]): void {
  if (file.text === canonical) return;

  problems.push(
    `${file.relativePath} is not in canonical form - rewrite it as two-space JSON with one ` +
      "value per line, the format's key order, and a blank line after every line ending in a " +
      'comma. That spacing is what lets two branches editing neighbouring fields merge, so it ' +
      'is checked rather than trusted'
  );
}

function validateWorldConfig(
  file: SimWorldFile,
  problems: string[]
): { outcome: SimRunOutcome } | undefined {
  const value = parseFileJson(file, problems);
  if (!value) return undefined;

  if (value.simVersion !== SIM_WORLD_VERSION) {
    problems.push(
      `${file.relativePath} \`simVersion\` must be the number ${SIM_WORLD_VERSION} ` +
        `(got ${JSON.stringify(value.simVersion)})`
    );
  }

  if (!isPlainObject(value.run)) {
    problems.push(`${file.relativePath} \`run\` must be an object with an \`outcome\``);
    return undefined;
  }

  const outcome = value.run.outcome;
  if (typeof outcome !== 'string' || !RUN_OUTCOMES.includes(outcome as SimRunOutcome)) {
    problems.push(
      `${file.relativePath} \`run.outcome\` ${JSON.stringify(outcome)} is not recognized - use ` +
        RUN_OUTCOMES.map((name) => `"${name}"`).join(', ')
    );
    return undefined;
  }

  const run = { outcome: outcome as SimRunOutcome };
  checkCanonicalBytes(file, formatSimWorldConfig({ simVersion: SIM_WORLD_VERSION, run }), problems);

  return run;
}

function validateModuleFile(file: SimWorldFile, problems: string[]): SimModule | undefined {
  if (!file.relativePath.endsWith(SIM_MODULE_FILE_SUFFIX)) {
    problems.push(
      `${file.relativePath} is not a module file - every file but ${SIM_WORLD_CONFIG_FILENAME} ` +
        `must be named \`<module path>${SIM_MODULE_FILE_SUFFIX}\``
    );
    return undefined;
  }

  const modulePath = normalizeSimPath(file.relativePath.slice(0, -SIM_MODULE_FILE_SUFFIX.length));
  if (typeof modulePath !== 'string') {
    problems.push(`${file.relativePath} names a module path that ${modulePath.invalid}`);
    return undefined;
  }

  const value = parseFileJson(file, problems);
  if (!value) return undefined;

  let valid = true;

  if (typeof value.content !== 'string') {
    problems.push(`${file.relativePath} must have string \`content\``);
    valid = false;
  }

  const imports = validateImports(value.imports, file.relativePath, problems);
  if (imports === undefined) valid = false;

  const stories = validateStories(value.stories, file.relativePath, problems);
  if (stories === undefined) valid = false;

  if (!valid || imports === undefined || stories === undefined) return undefined;

  const module: SimModule = {
    path: modulePath,
    content: value.content as string,
    imports,
    stories,
  };

  checkCanonicalBytes(file, formatSimModuleFile(module), problems);

  return module;
}

/**
 * A module's DIRECT imports. Absent means none - the closure over these edges
 * is the CLI's to compute (./deriveSimManifest), never the fixture's to flatten.
 */
function validateImports(
  value: unknown,
  filePath: string,
  problems: string[]
): string[] | undefined {
  if (value === undefined) return [];

  if (!Array.isArray(value) || value.length === 0) {
    problems.push(
      `${filePath} \`imports\` must be a non-empty array of module paths, or be absent`
    );
    return undefined;
  }

  const imports: string[] = [];
  let valid = true;

  for (const declared of value) {
    if (typeof declared !== 'string') {
      problems.push(`${filePath} \`imports\` entries must be module path strings`);
      valid = false;
      continue;
    }

    const normalized = normalizeSimPath(declared);
    if (typeof normalized !== 'string') {
      problems.push(`${filePath} import "${declared}" ${normalized.invalid}`);
      valid = false;
      continue;
    }

    if (imports.includes(normalized)) {
      problems.push(`${filePath} imports "${normalized}" twice`);
      valid = false;
      continue;
    }

    imports.push(normalized);
  }

  if (!valid) return undefined;

  const sorted = [...imports].sort();
  if (sorted.join('\n') !== imports.join('\n')) {
    problems.push(`${filePath} \`imports\` must be sorted`);
    return undefined;
  }

  return imports;
}

function validateStories(
  value: unknown,
  filePath: string,
  problems: string[]
): SimStory[] | undefined {
  if (value === undefined) return [];

  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${filePath} \`stories\` must be a non-empty array, or be absent`);
    return undefined;
  }

  const stories: SimStory[] = [];
  let valid = true;

  value.forEach((entry, index) => {
    const story = validateStory(entry, `${filePath} stories[${index}]`, problems);
    if (story === undefined) valid = false;
    else stories.push(story);
  });

  if (!valid) return undefined;

  const sorted = [...stories].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (sorted.map((story) => story.id).join('\n') !== stories.map((story) => story.id).join('\n')) {
    problems.push(`${filePath} \`stories\` must be sorted by id`);
    return undefined;
  }

  return stories;
}

function validateStory(value: unknown, label: string, problems: string[]): SimStory | undefined {
  if (!isPlainObject(value)) {
    problems.push(`${label} must be an object`);
    return undefined;
  }

  let valid = true;

  if (typeof value.id !== 'string' || value.id === '') {
    problems.push(`${label} must have a non-empty string \`id\``);
    valid = false;
  }

  for (const field of ['title', 'name'] as const) {
    const declared = value[field];
    if (declared !== undefined && (typeof declared !== 'string' || declared === '')) {
      problems.push(`${label} \`${field}\` must be a non-empty string when present`);
      valid = false;
    }
  }

  // `false` has no spelling: an error is declared by being there.
  if (value.error !== undefined && value.error !== true) {
    problems.push(`${label} \`error\` must be \`true\` when present, or be absent`);
    valid = false;
  }

  if (!isPlainObject(value.render) || typeof value.render.text !== 'string') {
    problems.push(`${label} must have a \`render\` object with string \`text\``);
    valid = false;
  } else if (typeof value.render.bg !== 'string' || !HEX_COLOR.test(value.render.bg)) {
    // The API's own renderer refuses anything else, so accepting it here would
    // only move the refusal to a place the fixture author cannot see it.
    problems.push(`${label} \`render.bg\` must be a \`#rrggbb\` colour`);
    valid = false;
  }

  if (!valid) return undefined;

  const render = value.render as { text: string; bg: string };

  return {
    id: value.id as string,
    ...(value.title !== undefined ? { title: value.title as string } : {}),
    ...(value.name !== undefined ? { name: value.name as string } : {}),
    ...(value.error === true ? { error: true as const } : {}),
    render: { text: render.text, bg: render.bg },
  };
}

/** Every import must name a module the tree actually declares. */
function checkImportTargetsExist(modules: SimModule[], problems: string[]): void {
  const declaredPaths = new Set(modules.map((module) => module.path));

  for (const module of modules) {
    for (const imported of module.imports) {
      if (!declaredPaths.has(imported)) {
        problems.push(
          `${module.path}${SIM_MODULE_FILE_SUFFIX} imports "${imported}", which no file declares`
        );
      }
    }
  }
}

/** Story ids are the snapshot's viewId, so a duplicate is two screens in one. */
function checkStoryIdsAreUnique(modules: SimModule[], problems: string[]): void {
  const fileById = new Map<string, string>();

  for (const module of modules) {
    for (const story of module.stories) {
      const other = fileById.get(story.id);
      if (other !== undefined) {
        problems.push(
          `story id "${story.id}" is declared by both ${other} and ${module.path} - ids must be unique`
        );
        continue;
      }
      fileById.set(story.id, module.path);
    }
  }
}
