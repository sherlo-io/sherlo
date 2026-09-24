/**
 * EVERY DOOR IS A SEAM (sherlo / The seams, "Every door is a seam").
 *
 * A command reaches the world only through `src/seams/`. A read written straight into a command
 * answers from the machine a pose ran on, and the screen looks right - which is why this is a lint
 * and a census rather than a review note. The lint lives in the root `.eslintrc.js` (the
 * `packages/cli/src/**` override); this file is the census that proves it holds on the whole tree
 * and lists every exception with its reason, so a new one is a visible decision, never a silent
 * default.
 *
 * THE CENSUS RE-RUNS THE LINT WITH NO EXCEPTIONS. It reads the root config's own rule objects (so
 * there is one definition of the rule, not two that can drift) and lints the tree as if none of
 * the later `excludedFiles`/`off` overrides existed, so what comes back is the RAW violation set -
 * every module that reaches the SDK client, a socket, a process, or a file outside the project
 * folder, directly. Each test below checks a different shape of that set against the exceptions
 * named here.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterAll } from 'vitest';

// `eslint` ships no type declarations of its own, so it is reached through `require` (typed
// `any` by @types/node) rather than an `import` TypeScript cannot resolve a declaration for.

const { ESLint } = require('eslint');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLI_SRC = path.join(REPO_ROOT, 'packages/cli/src');

/** One rule's config, as `.eslintrc.js` writes it - the shape `ESLint`'s `overrideConfig.rules` wants. */
type RuleConfig = string | number | unknown[];

const DOOR_RULES = [
  '@typescript-eslint/no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-syntax',
] as const;

type DoorViolation = {
  /** Repo-relative path, e.g. `packages/cli/src/commands/showError/showError.ts`. */
  file: string;
  ruleId: (typeof DOOR_RULES)[number];
  /** Which door this particular message is about - see `categorize` below. */
  door: 'sdk-client' | 'fetch' | 'node-core' | 'fs-root';
};

/** A message's own words say which door it is - the four rule objects below never state it directly. */
function categorize(ruleId: string, message: string): DoorViolation['door'] {
  if (ruleId === '@typescript-eslint/no-restricted-imports') return 'sdk-client';
  if (ruleId === 'no-restricted-globals') return 'fetch';
  if (message.startsWith('A file read outside the project folder seam')) return 'fs-root';
  return 'node-core';
}

/**
 * The root `.eslintrc.js`'s own "EVERY DOOR IS A SEAM" rule objects - the override for every
 * `.ts` file under `packages/cli/src`, excluding the seams themselves and any `__tests__`
 * directory. Read off the real config rather than retyped here, so the census can never drift
 * from the lint it is proving.
 */
function readDoorRules(): Record<string, RuleConfig> {
  const rootConfig = require(path.join(REPO_ROOT, '.eslintrc.js'));
  const baseOverride = (
    rootConfig.overrides as {
      files: string[];
      excludedFiles?: string[];
      rules?: Record<string, RuleConfig>;
    }[]
  ).find((o) => o.files.includes('packages/cli/src/**/*.ts') && o.excludedFiles);
  if (!baseOverride?.rules) {
    throw new Error(
      'doors-are-seams.test.ts could not find the "EVERY DOOR IS A SEAM" override in the root .eslintrc.js'
    );
  }
  return baseOverride.rules;
}

// Linting the whole tree is the slow part of this file (seconds, not milliseconds) - memoized so
// the two tests that both need the raw violation set pay for it once, not twice.
let rawViolations: Promise<DoorViolation[]> | undefined;

/** Lint every `.ts` file under `packages/cli/src`, ignoring the seams and any `__tests__` directory, with NO other exception. */
function findRawViolations(): Promise<DoorViolation[]> {
  if (!rawViolations) rawViolations = computeRawViolations();
  return rawViolations;
}

async function computeRawViolations(): Promise<DoorViolation[]> {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    useEslintrc: false,
    overrideConfig: { root: true, extends: '@react-native', rules: readDoorRules() },
  });

  const results = await eslint.lintFiles(['packages/cli/src/**/*.ts']);
  const violations: DoorViolation[] = [];

  for (const result of results) {
    const file = path.relative(REPO_ROOT, result.filePath);
    if (
      file.includes(`${path.sep}seams${path.sep}`) ||
      file.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      continue;
    }

    for (const message of result.messages) {
      if (!message.ruleId || !(DOOR_RULES as readonly string[]).includes(message.ruleId)) continue;
      violations.push({
        file,
        ruleId: message.ruleId as DoorViolation['ruleId'],
        door: categorize(message.ruleId, message.message),
      });
    }
  }

  return violations;
}

/**
 * THE EXCEPTIONS, and nothing outside them. Every one is EITHER a whole directory (a command that
 * cannot be posed, or the devtools that install the seams) or a single named file (the live half
 * of one seam, reached only from the `src/seams/*.ts` beside it - or a file whose one read outside
 * the project folder never touches the project or the environment).
 */
const DIRECTORY_EXCEPTIONS: { dir: string; door: DoorViolation['door']; reason: string }[] = [
  {
    dir: 'commands/easBuildOnComplete',
    door: 'sdk-client',
    reason: "a command that runs inside Expo's build service and is not posable",
  },
  {
    dir: 'commands/testEasCloudBuild',
    door: 'sdk-client',
    reason: "a command that runs inside Expo's build service and is not posable",
  },
  {
    dir: 'commands/testEasCloudBuild',
    door: 'node-core',
    reason: "a command that runs inside Expo's build service and is not posable",
  },
  {
    dir: 'commands/showError',
    door: 'fetch',
    reason: 'reads a crash from the machine it happened on, not posable',
  },
  {
    dir: 'commands/showError',
    door: 'node-core',
    reason: 'reads a crash from the machine it happened on, not posable',
  },
  {
    dir: 'commands/showError',
    door: 'fs-root',
    reason: 'reads a crash from the machine it happened on, not posable',
  },
  {
    dir: 'commands/pose',
    door: 'fs-root',
    reason: 'the devtools that install the seams',
  },
];

const FILE_EXCEPTIONS: { file: string; door: DoorViolation['door']; reason: string }[] = [
  {
    file: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/uploadBuild.ts',
    door: 'node-core',
    reason: 'the live half of the nativeBuild seam, reached only from src/seams/nativeBuild.ts',
  },
  {
    file: 'commands/test/uploadStagedArtifacts.ts',
    door: 'node-core',
    reason: 'the live half of the nativeBuild seam, reached only from src/seams/nativeBuild.ts',
  },
  {
    file: 'commands/test/uploadStagedArtifacts.ts',
    door: 'fs-root',
    reason:
      "packs the bundler's assets output into a scratch tarball under the OS temp directory before uploading it, then deletes it",
  },
  {
    file: 'commands/test/buildBundle.ts',
    door: 'node-core',
    reason: 'the live half of the bundler seam, reached only from src/seams/bundler.ts',
  },
  {
    file: 'commands/test/bundleSidecar.ts',
    door: 'fs-root',
    reason:
      "reads the CLI's own package.json (walking up from __dirname) to report its own version, not the project's",
  },
  {
    file: 'helpers/runShellCommand/executeCommand.ts',
    door: 'node-core',
    reason: 'the live half of the workstation seam, reached only from src/seams/workstation.ts',
  },
  {
    file: 'helpers/runShellCommand/tryToFixPermissionAndRetryOnce.ts',
    door: 'node-core',
    reason: 'the live half of the workstation seam, reached only from src/seams/workstation.ts',
  },
];

/** `packages/cli/src/commands/showError/foo.ts` -> true for the directory `commands/showError`. */
function isUnderDir(file: string, dir: string): boolean {
  const prefix = `packages/cli/src/${dir}/`;
  return file.startsWith(prefix) || file === `packages/cli/src/${dir}`;
}

function isExempt(v: DoorViolation): boolean {
  if (DIRECTORY_EXCEPTIONS.some((e) => e.door === v.door && isUnderDir(v.file, e.dir))) return true;
  return FILE_EXCEPTIONS.some((e) => e.door === v.door && v.file === `packages/cli/src/${e.file}`);
}

describe('every door is a seam', () => {
  it('outside src/seams no module imports the SDK client, opens a socket, spawns a process, or reads a file outside the project folder', async () => {
    const violations = await findRawViolations();
    const uncovered = violations.filter((v) => !isExempt(v));

    expect(
      uncovered,
      uncovered.length > 0
        ? `Found a door outside src/seams/ with no named exception:\n${uncovered
            .map((v) => `  ${v.file} (${v.door}, ${v.ruleId})`)
            .join('\n')}\nName it in doors-are-seams.test.ts with its reason, or close the door.`
        : undefined
    ).toEqual([]);
  }, 20_000);

  it('the named exceptions are exactly the modules a pose can never reach - the EAS hooks, showError, and the devtools - each with its reason', async () => {
    const violations = await findRawViolations();

    for (const exception of DIRECTORY_EXCEPTIONS) {
      expect(
        exception.reason.length,
        `${exception.dir} (${exception.door}) is missing a reason`
      ).toBeGreaterThan(0);
      expect(
        violations.some((v) => v.door === exception.door && isUnderDir(v.file, exception.dir)),
        `${exception.dir} names a ${exception.door} exception that nothing under it actually needs - drop it`
      ).toBe(true);
    }

    for (const exception of FILE_EXCEPTIONS) {
      expect(
        exception.reason.length,
        `${exception.file} (${exception.door}) is missing a reason`
      ).toBeGreaterThan(0);
      expect(
        violations.some(
          (v) => v.door === exception.door && v.file === `packages/cli/src/${exception.file}`
        ),
        `${exception.file} names a ${exception.door} exception that it does not actually need - drop it`
      ).toBe(true);
    }
  }, 20_000);

  it('a new module that imports the SDK client outside src/seams fails the lint by name', async () => {
    const scratchDir = path.join(CLI_SRC, 'commands', '__doorsCensusScratch__');
    const scratchFile = path.join(scratchDir, 'newViolation.ts');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(
      scratchFile,
      "import sdkClient from '@sherlo/sdk-client';\n\nexport default sdkClient;\n"
    );

    try {
      const eslint = new ESLint({
        cwd: REPO_ROOT,
        useEslintrc: false,
        overrideConfig: { root: true, extends: '@react-native', rules: readDoorRules() },
      });
      const results = await eslint.lintFiles([path.relative(REPO_ROOT, scratchFile)]);
      const messages: { ruleId: string | null }[] = results[0]?.messages ?? [];

      expect(
        messages.some((m) => m.ruleId === '@typescript-eslint/no-restricted-imports'),
        `expected the new module ${path.relative(
          REPO_ROOT,
          scratchFile
        )} to fail the SDK-client lint, and it did not`
      ).toBe(true);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('the staged run opens its build through the server seam, never through a client of its own', () => {
    const simRunSource = fs.readFileSync(path.join(CLI_SRC, 'commands/test/simRun.ts'), 'utf8');

    expect(simRunSource).toMatch(/serverCalls\(\)\s*\.\s*openBuild\(/);
    expect(simRunSource).toMatch(/serverCalls\(\)\s*\.\s*getStagedUploadUrls\(/);
    expect(simRunSource).not.toMatch(/\bclient\.(openBuild|getStagedUploadUrls)\(/);
  });
});

afterAll(() => {
  // Belt-and-braces: the scratch-module test always cleans up in its own `finally`, but a run
  // interrupted mid-test (Ctrl-C, a crash) could leave it behind - and a leftover module under
  // src/commands/ would itself fail the lint on the next run.
  fs.rmSync(path.join(CLI_SRC, 'commands', '__doorsCensusScratch__'), {
    recursive: true,
    force: true,
  });
});
