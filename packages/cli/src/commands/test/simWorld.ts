/**
 * The SIM WORLD FILE - the declared JSON app a sim-mode run tests instead of a
 * real one (sim-mode design section 1).
 *
 * One committed file IS the app: `modules` are its "source files" (content is a
 * free string), `stories` declare which module each story lives in, what it
 * imports, and what the sim executor should draw, and `run.outcome` declares how
 * the pretend run ends. The CLI derives the REAL-format module manifest from
 * this file (see ./deriveSimManifest) and uploads the file itself for the sim
 * executor to render - the server never learns a second manifest format.
 *
 * Validation here is STRICT and readable, the opposite of the module-manifest
 * reader's bail-open contract: a world file is a hand-written fixture, so every
 * problem is reported at once, each naming the offending story/path/field, and
 * the run refuses. There is no build to degrade to - the world IS the app.
 */
import fs from 'fs';
import path from 'path';
import { DEFAULT_CONFIG_FILENAME, DEFAULT_PROJECT_ROOT } from '../../constants';
import parseConfigFile from '../../helpers/getValidatedCommandParams/getNormalizedConfig/parseConfigFile';
import throwError from '../../helpers/throwError';

/** The config field that declares a run's sim world - its presence IS sim mode. */
export const SIMULATION_CONFIG_FIELD = 'simulation';

/** The one world-file format version this CLI understands. */
export const SIM_WORLD_VERSION = 1;

export type SimStory = {
  /** Storybook-style story id, unique across the world. */
  id: string;
  /** Normalized module path of the story's source file. */
  file: string;
  /** Normalized module paths this story('s file) imports directly. */
  imports: string[];
  /** What the sim executor draws - centered text on a solid ground. */
  render: { text: string; bg: string } & Record<string, unknown>;
};

export type SimRunOutcome = 'ok' | 'crash-on-launch' | 'system-error' | { storyErrors: string[] };

export type SimWorld = {
  simVersion: typeof SIM_WORLD_VERSION;
  /** Every "source file" of the pretend app: normalized path -> content string. */
  modules: Record<string, string>;
  stories: SimStory[];
  run: { outcome: SimRunOutcome };
};

export type ValidatedSimWorld = {
  /** The world file bytes exactly as committed (uploaded verbatim for the executor). */
  raw: Buffer;
  /** Parsed world with every module/story path normalized (`./`-free posix). */
  parsed: SimWorld;
  /** Absolute path the world was read from - for error messages and logs. */
  filePath: string;
};

const OUTCOME_STRINGS = ['ok', 'crash-on-launch', 'system-error'] as const;

/**
 * Where this run's sim world lives, if anywhere: SOLELY the `simulation` field
 * of the config file, holding a path relative to that config file's directory.
 * Present -> sim mode, reading the world from there. Absent -> undefined, and
 * the run is a normal one. There is no file sniffing and no flag.
 */
export function resolveSimulationWorldPath(options: {
  config?: string;
  projectRoot?: string;
}): string | undefined {
  const configFilePath = path.resolve(
    options.projectRoot || DEFAULT_PROJECT_ROOT,
    options.config || DEFAULT_CONFIG_FILENAME
  );

  const { simulation } = parseConfigFile(configFilePath) as {
    simulation?: unknown;
  };

  if (simulation === undefined) {
    return undefined;
  }

  if (typeof simulation !== 'string' || simulation.trim() === '') {
    throwError({
      message:
        `\`${SIMULATION_CONFIG_FIELD}\` in ${configFilePath} must be a non-empty string - the path ` +
        `of the sim world file, relative to the config file's directory (got ` +
        `${JSON.stringify(simulation)}).`,
    });
  }

  const worldFilePath = path.resolve(path.dirname(configFilePath), simulation);
  if (!fs.existsSync(worldFilePath)) {
    throwError({
      message:
        `\`${SIMULATION_CONFIG_FIELD}\` in ${configFilePath} names a sim world file that does not ` +
        `exist: ${worldFilePath}. The path is resolved relative to the config file's directory.`,
    });
  }

  return worldFilePath;
}

/**
 * Read and validate a sim world file. Throws (via throwError) with EVERY
 * problem listed at once - a fixture author fixes the whole file in one pass.
 */
export function readSimWorld(filePath: string): ValidatedSimWorld {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch (error) {
    throwError({
      message:
        `Could not read the sim world file at ${filePath} ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throwError({
      message:
        `The sim world file at ${filePath} is not valid JSON ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    });
  }

  const { world, problems } = validateSimWorld(parsedJson);
  if (!world) {
    throwError({
      message:
        `The sim world file at ${filePath} is invalid:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    });
  }

  return { raw, parsed: world, filePath };
}

/* ========================================================================== */

/**
 * Validate an already-parsed world value. Exposed for tests; collects every
 * problem instead of stopping at the first.
 */
export function validateSimWorld(
  value: unknown
): { world: SimWorld; problems: [] } | { world: null; problems: string[] } {
  const problems: string[] = [];

  if (!isPlainObject(value)) {
    return { world: null, problems: ['the top level must be a JSON object'] };
  }

  if (value.simVersion !== SIM_WORLD_VERSION) {
    problems.push(
      `\`simVersion\` must be the number ${SIM_WORLD_VERSION} (got ${JSON.stringify(
        value.simVersion
      )})`
    );
  }

  const modules = validateModules(value.modules, problems);
  const stories = validateStories(value.stories, modules, problems);
  const outcome = validateRun(value.run, stories, problems);

  if (problems.length > 0 || !modules || !stories || !outcome) {
    return { world: null, problems };
  }

  return {
    world: { simVersion: SIM_WORLD_VERSION, modules, stories, run: { outcome } },
    problems: [],
  };
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

/* ========================================================================== */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateModules(value: unknown, problems: string[]): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    problems.push('`modules` must be an object mapping module paths to content strings');
    return undefined;
  }

  const modules: Record<string, string> = {};

  for (const [declaredPath, content] of Object.entries(value)) {
    if (typeof content !== 'string') {
      problems.push(`module "${declaredPath}" must have string content`);
      continue;
    }

    const normalized = normalizeSimPath(declaredPath);
    if (typeof normalized !== 'string') {
      problems.push(`module path "${declaredPath}" ${normalized.invalid}`);
      continue;
    }

    if (normalized in modules) {
      problems.push(
        `module path "${declaredPath}" collides with another declared module after normalization ("${normalized}")`
      );
      continue;
    }

    modules[normalized] = content;
  }

  return modules;
}

function validateStories(
  value: unknown,
  modules: Record<string, string> | undefined,
  problems: string[]
): SimStory[] | undefined {
  if (!Array.isArray(value)) {
    problems.push('`stories` must be an array');
    return undefined;
  }

  const stories: SimStory[] = [];
  const seenIds = new Set<string>();

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      problems.push(`stories[${index}] must be an object`);
      return;
    }

    const label =
      typeof entry.id === 'string' && entry.id !== '' ? `story "${entry.id}"` : `stories[${index}]`;

    let valid = true;

    if (typeof entry.id !== 'string' || entry.id === '') {
      problems.push(`${label} must have a non-empty string \`id\``);
      valid = false;
    } else if (seenIds.has(entry.id)) {
      problems.push(`${label} declares a duplicate id - story ids must be unique`);
      valid = false;
    } else {
      seenIds.add(entry.id);
    }

    const file = validateStoryPath(entry.file, `${label} \`file\``, modules, problems);
    if (file === undefined) valid = false;

    let imports: string[] | undefined;
    if (!Array.isArray(entry.imports)) {
      problems.push(`${label} must have an \`imports\` array (empty is fine)`);
      valid = false;
    } else {
      imports = [];
      for (const imported of entry.imports) {
        const normalized = validateStoryPath(imported, `${label} import`, modules, problems);
        if (normalized === undefined) {
          valid = false;
        } else {
          imports.push(normalized);
        }
      }
    }

    if (
      !isPlainObject(entry.render) ||
      typeof entry.render.text !== 'string' ||
      typeof entry.render.bg !== 'string'
    ) {
      problems.push(`${label} must have a \`render\` object with string \`text\` and \`bg\``);
      valid = false;
    }

    if (valid && file !== undefined && imports !== undefined) {
      stories.push({
        id: entry.id as string,
        file,
        imports,
        render: entry.render as SimStory['render'],
      });
    }
  });

  return stories;
}

/** Validate one declared story path: a string, normalizable, and a declared module. */
function validateStoryPath(
  value: unknown,
  label: string,
  modules: Record<string, string> | undefined,
  problems: string[]
): string | undefined {
  if (typeof value !== 'string') {
    problems.push(`${label} must be a string module path`);
    return undefined;
  }

  const normalized = normalizeSimPath(value);
  if (typeof normalized !== 'string') {
    problems.push(`${label} "${value}" ${normalized.invalid}`);
    return undefined;
  }

  if (modules && !(normalized in modules)) {
    problems.push(`${label} "${value}" does not name a declared module`);
    return undefined;
  }

  return normalized;
}

function validateRun(
  value: unknown,
  stories: SimStory[] | undefined,
  problems: string[]
): SimRunOutcome | undefined {
  if (!isPlainObject(value)) {
    problems.push('`run` must be an object with an `outcome`');
    return undefined;
  }

  const outcome = value.outcome;

  if (typeof outcome === 'string') {
    if ((OUTCOME_STRINGS as readonly string[]).includes(outcome)) {
      return outcome as SimRunOutcome;
    }
    problems.push(
      `\`run.outcome\` "${outcome}" is not recognized - use ${OUTCOME_STRINGS.map(
        (name) => `"${name}"`
      ).join(', ')} or { "storyErrors": [<story ids>] }`
    );
    return undefined;
  }

  if (isPlainObject(outcome) && Array.isArray(outcome.storyErrors)) {
    const storyErrors: string[] = [];
    const knownIds = new Set((stories ?? []).map((story) => story.id));
    let valid = true;

    for (const id of outcome.storyErrors) {
      if (typeof id !== 'string') {
        problems.push('`run.outcome.storyErrors` entries must be story id strings');
        valid = false;
      } else if (stories && !knownIds.has(id)) {
        problems.push(
          `\`run.outcome.storyErrors\` names "${id}", which is not a declared story id`
        );
        valid = false;
      } else {
        storyErrors.push(id);
      }
    }

    return valid ? { storyErrors } : undefined;
  }

  problems.push(
    '`run.outcome` must be "ok", "crash-on-launch", "system-error", or { "storyErrors": [<story ids>] }'
  );
  return undefined;
}
