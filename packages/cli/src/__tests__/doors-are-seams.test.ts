/**
 * EVERY DOOR IS A SEAM.
 *
 * A command reaches the world only through `src/seams/`. A read written straight into a command
 * answers from the machine a pose ran on, and the screen looks right - which is why this is a lint
 * and a census rather than a review note. The lint lives in the root `.oxlintrc.json` (the
 * `packages/cli/src/**` override); this file is the census that proves it holds on the whole tree
 * and lists every exception with its reason, so a new one is a visible decision, never a silent
 * default.
 *
 * THE CENSUS RE-RUNS THE LINT WITH NO EXCEPTIONS. It reads the root config's own rule objects (so
 * there is one definition of the rule, not two that can drift) and lints the tree as if none of
 * the later exception overrides existed, so what comes back is the RAW violation set -
 * every module that reaches the SDK client, a socket, a process, or a file outside the project
 * folder, directly. Each test below checks a different shape of that set against the exceptions
 * named here.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '@babel/parser';
import type * as babel from '@babel/types';
import { describe, it, expect, afterAll } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLI_SRC = path.join(REPO_ROOT, 'packages/cli/src');

/** One rule's config, as `.oxlintrc.json` writes it. */
type RuleConfig = string | unknown[];

const DOOR_RULES = [
  'no-restricted-imports',
  'doors/no-require-of-a-door',
  'no-restricted-globals',
  'no-restricted-properties',
] as const;

type DoorViolation = {
  /** Repo-relative path, e.g. `packages/cli/src/commands/test/buildBundle.ts`. */
  file: string;
  ruleId: (typeof DOOR_RULES)[number];
  /** Which door this particular message is about - see `categorize` below. */
  door: 'sdk-client' | 'fetch' | 'node-core' | 'fs-root';
};

/** A message's own words say which door it is - the rule objects below never state it directly. */
function categorize(ruleId: string, words: string): DoorViolation['door'] {
  if (words.includes('A file read outside the project folder seam')) return 'fs-root';
  if (ruleId === 'no-restricted-globals') return 'fetch';
  if (words.includes('@sherlo/sdk-client')) return 'sdk-client';
  return 'node-core';
}

/**
 * The root `.oxlintrc.json`'s own "EVERY DOOR IS A SEAM" rule objects - the override for every
 * `.ts` file under `packages/cli/src`; the overrides after it name the exceptions. Read off the
 * real config rather than retyped here, so the census can never drift from the lint it is proving.
 */
function readDoorRules(): Record<string, RuleConfig> {
  const rootConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.oxlintrc.json'), 'utf8'));
  const baseOverride = (
    rootConfig.overrides as { files: string[]; rules?: Record<string, RuleConfig> }[]
  ).find((o) => o.files.length === 1 && o.files[0] === 'packages/cli/src/**/*.ts');
  if (!baseOverride?.rules) {
    throw new Error(
      'doors-are-seams.test.ts could not find the "EVERY DOOR IS A SEAM" override in the root .oxlintrc.json'
    );
  }
  return baseOverride.rules;
}

type OxlintDiagnostic = { code: string; message: string; help?: string; filename: string };

/**
 * Lint files with the door rules and nothing else - no exception, no other rule. The census asks
 * only which doors a module opens. Each finding comes back with its rule's plain name
 * (`no-restricted-imports`, `doors/no-require-of-a-door`).
 */
function lintWithTheDoorRulesAlone(
  targets: string[]
): { file: string; ruleId: string; words: string }[] {
  const configFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'doors-census-'));
  const configFile = path.join(configFolder, '.oxlintrc.json');
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      categories: { correctness: 'off' },
      plugins: ['eslint'],
      jsPlugins: [{ name: 'doors', specifier: path.join(REPO_ROOT, '.oxlint/doors-plugin.js') }],
      rules: readDoorRules(),
    })
  );

  try {
    const oxlint = path.join(path.dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint');
    let printed: string;
    try {
      printed = execFileSync(
        process.execPath,
        [oxlint, '-c', configFile, '--format', 'json', '--no-ignore', ...targets],
        { cwd: REPO_ROOT, encoding: 'utf8' }
      );
    } catch (failure) {
      // oxlint exits 1 when it finds an error: the findings are the point, on stdout all the same.
      printed = (failure as { stdout: string }).stdout;
    }
    const diagnostics: OxlintDiagnostic[] = JSON.parse(printed).diagnostics;

    return diagnostics.map((diagnostic) => ({
      file: path.relative(REPO_ROOT, path.resolve(REPO_ROOT, diagnostic.filename)),
      ruleId: diagnostic.code.replace(/^eslint\((.*)\)$/, '$1').replace(/^(\w+)\((.*)\)$/, '$1/$2'),
      words: `${diagnostic.message} ${diagnostic.help ?? ''}`,
    }));
  } finally {
    fs.rmSync(configFolder, { recursive: true, force: true });
  }
}

// Linting the whole tree is the slow part of this file - memoized so the two tests that both need
// the raw violation set pay for it once, not twice.
let rawViolations: Promise<DoorViolation[]> | undefined;

/** Lint every `.ts` file under `packages/cli/src`, ignoring the seams and any `__tests__` directory, with NO other exception. */
function findRawViolations(): Promise<DoorViolation[]> {
  if (!rawViolations) rawViolations = computeRawViolations();
  return rawViolations;
}

async function computeRawViolations(): Promise<DoorViolation[]> {
  const violations: DoorViolation[] = [];

  for (const finding of lintWithTheDoorRulesAlone(['packages/cli/src'])) {
    if (!finding.file.endsWith('.ts')) continue;
    if (
      finding.file.includes(`${path.sep}seams${path.sep}`) ||
      finding.file.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      continue;
    }
    if (!(DOOR_RULES as readonly string[]).includes(finding.ruleId)) continue;

    violations.push({
      file: finding.file,
      ruleId: finding.ruleId as DoorViolation['ruleId'],
      door: categorize(finding.ruleId, finding.words),
    });
  }

  return violations;
}

/**
 * THE EXCEPTIONS, and nothing outside them. Every one is EITHER a whole directory (a command that
 * cannot be posed, or the devtools that install the seams) or a single named file (the live half
 * of one seam, reached only from its seam or from another live half - proved below by
 * `LIVE_HALF_SET` - or a file whose one read outside the project folder never touches the
 * project or the environment).
 */
const DIRECTORY_EXCEPTIONS: { dir: string; door: DoorViolation['door']; reason: string }[] = [
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
    reason:
      'the live half of the nativeBuild seam, reached only from its seam or from another live half',
  },
  {
    file: 'commands/test/uploadStagedArtifacts.ts',
    door: 'node-core',
    reason:
      'the live half of the nativeBuild seam, reached only from its seam or from another live half',
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
    reason:
      'the live half of the bundler seam, reached only from its seam or from another live half',
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
    reason:
      'the live half of the workstation seam, reached only from its seam or from another live half',
  },
  {
    file: 'helpers/runShellCommand/tryToFixPermissionAndRetryOnce.ts',
    door: 'node-core',
    reason:
      'the live half of the workstation seam, reached only from its seam or from another live half',
  },
];

/** One `import ... from '<specifier>'` this file makes, resolved to the file it actually reaches. */
type ValueImportEdge = {
  /** Repo-relative path of the importing file. */
  from: string;
  /** Repo-relative path of the resolved target - following `index.ts` the way Node/TS do. */
  to: string;
};

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** `./uploadBuild` from a file next to it resolves to `uploadBuild.ts`, or `uploadBuild/index.ts`. */
function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Every VALUE import edge under `packages/cli/src` - a file naming another in a plain `import`,
 * resolved the way Node/TS actually resolve it (following an `index.ts` barrel). `import type`
 * (whole-statement or per-name) is excluded: a type is erased before anything runs, so it can
 * never carry a command to a door.
 */
let valueImportEdges: ValueImportEdge[] | undefined;

function findValueImportEdges(): ValueImportEdge[] {
  if (valueImportEdges) return valueImportEdges;

  const edges: ValueImportEdge[] = [];
  for (const file of listSourceFiles(CLI_SRC)) {
    for (const statement of importsIn(fs.readFileSync(file, 'utf8'))) {
      if (statement.importKind === 'type') continue;

      const target = resolveRelativeImport(file, statement.source.value);
      if (!target) continue;

      const hasValueBinding =
        statement.specifiers.length === 0 || // a side-effecting `import '...'` still runs the module
        statement.specifiers.some(
          // a default or namespace import, or a name not marked `type`
          (specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type'
        );

      if (hasValueBinding) {
        edges.push({ from: path.relative(REPO_ROOT, file), to: path.relative(REPO_ROOT, target) });
      }
    }
  }

  valueImportEdges = edges;
  return edges;
}

/**
 * THE LIVE-HALF SET - every module that is the live implementation of a seam (or is called only
 * from inside one), one named list with the seam beside each entry. Some open a door themselves
 * (also in FILE_EXCEPTIONS above); the rest carry no door of their own but sit on the only path
 * to one, so a stray importer of THEM would be exactly as unposable as a stray importer of the
 * door itself. The barrels (`index.ts`) are listed beside the file they re-export because an
 * `import './x'` from a sibling resolves to `x/index.ts`, not straight to `x/uploadX.ts`.
 */
const LIVE_HALF_SET: { file: string; seam: string }[] = [
  // nativeBuild (packages/cli/src/seams/nativeBuild.ts)
  { file: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/uploadBuild.ts', seam: 'nativeBuild' },
  { file: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/index.ts', seam: 'nativeBuild' },
  {
    file: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/getBuildData/getBuildData.ts',
    seam: 'nativeBuild',
  },
  {
    file: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/getBuildData/compressDirectoryToTarGzip.ts',
    seam: 'nativeBuild',
  },
  { file: 'commands/test/uploadStagedArtifacts.ts', seam: 'nativeBuild' },
  { file: 'helpers/fingerprint/baseFingerprint.ts', seam: 'nativeBuild' },
  { file: 'helpers/fingerprint/gateMetadata.ts', seam: 'nativeBuild' },
  {
    file: 'helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive.ts',
    seam: 'nativeBuild',
  },
  {
    file: 'helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/getLocalBinariesInfo.ts',
    seam: 'nativeBuild',
  },
  {
    file: 'helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/index.ts',
    seam: 'nativeBuild',
  },
  // bundler (packages/cli/src/seams/bundler.ts)
  { file: 'commands/test/buildBundle.ts', seam: 'bundler' },
  // workstation (packages/cli/src/seams/workstation.ts) - executeCommand's shared retry
  // (tryToFixPermissionAndRetryOnce.ts) and runShellCommand.ts are its own live half too, and
  // it is also the one door every nativeBuild helper above shells out through.
  { file: 'helpers/runShellCommand/executeCommand.ts', seam: 'workstation' },
  { file: 'helpers/runShellCommand/tryToFixPermissionAndRetryOnce.ts', seam: 'workstation' },
  { file: 'helpers/runShellCommand/runShellCommand.ts', seam: 'workstation' },
  { file: 'helpers/runShellCommand/index.ts', seam: 'workstation' },
  // surroundings (packages/cli/src/seams/surroundings.ts)
  { file: 'helpers/getGitInfo.ts', seam: 'surroundings' },
];

const SEAM_FILE: Record<string, string> = {
  nativeBuild: 'seams/nativeBuild.ts',
  bundler: 'seams/bundler.ts',
  workstation: 'seams/workstation.ts',
  surroundings: 'seams/surroundings.ts',
};

/**
 * A handful of files reach into a live-half module for a reason that is NOT "it is itself a live
 * half" - each is safe by its own construction, named here with exactly that reason. Widening
 * this list is exactly as visible a decision as widening FILE_EXCEPTIONS.
 */
const ALLOWED_ADDITIONAL_IMPORTERS: { file: string; of: string; reason: string }[] = [
  {
    file: 'helpers/uploadOrPrintBinaryReuse/uploadOrPrintBinaryReuse.ts',
    of: 'helpers/uploadOrPrintBinaryReuse/uploadBuild/index.ts',
    reason:
      "calls uploadBuild's shared retry/orchestration loop, but always supplies its own effects sourced from nativeBuild() in force - it never falls through to uploadBuild's real-machine default",
  },
  {
    file: 'commands/test/simRun.ts',
    of: 'commands/test/uploadStagedArtifacts.ts',
    reason:
      'calls putBuffer, which itself PUTs through nativeBuild().putBinary - a posed sim run sends nothing real',
  },
  {
    file: 'commands/easBuildOnComplete/helpers/asyncUploadBuildAndRunTests/asyncUploadBuildAndRunTests.ts',
    of: 'commands/test/uploadStagedArtifacts.ts',
    reason:
      'calls putBuffer to stage the module map an EAS build wrote, which itself PUTs through nativeBuild().putBinary - a posed hook sends nothing real',
  },
  {
    file: 'commands/test/bundleSidecar.ts',
    of: 'commands/test/buildBundle.ts',
    reason:
      'imports only getExpoSdkVersion, which reads app.json/package.json inside the project - never the spawning export',
  },
  {
    file: 'commands/test/suppliedBundle.ts',
    of: 'commands/test/buildBundle.ts',
    reason:
      'imports only inspectBundleArtifacts, which reads the supplied bundle file - never the spawning export',
  },
  {
    file: 'helpers/fingerprint/registerBase.ts',
    of: 'helpers/fingerprint/baseFingerprint.ts',
    reason:
      'computes a fingerprint itself only when its caller omits baseFingerprintHash - the one non-exempt caller (uploadOrReuseBuildsAndRunTests.ts) always hands it the fingerprint its own caller took before the build, so this fallback is never reached',
  },
  {
    file: 'helpers/fingerprint/registerBase.ts',
    of: 'helpers/fingerprint/gateMetadata.ts',
    reason:
      "wraps extractGateMetadata as its own default effect, but the one non-exempt caller (uploadOrReuseBuildsAndRunTests.ts) always overrides it with nativeBuild()'s - this default is never reached",
  },
  {
    file: 'seams/appBuilder.ts',
    of: 'helpers/fingerprint/baseFingerprint.ts',
    reason:
      "imports only hashNativeFolderFiles, for the live half of the app builder seam itself - a posed run installs the posed app builder, which answers from the pose's nativeFolderFiles and never reaches it",
  },
];

/**
 * Every import in one source that reaches the shell runner: one naming `runShellCommand`, whatever
 * module it names (a folder's index re-exports it), or one resolving to a live half by path.
 */
function shellRunnerImports(file: string, text: string): string[] {
  const liveHalfFiles = new Set(LIVE_HALF_SET.map((entry) => `packages/cli/src/${entry.file}`));
  const reaches: string[] = [];

  for (const statement of importsIn(text)) {
    const namesTheRunner = statement.specifiers.some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' && importedName(specifier) === 'runShellCommand'
    );
    const target = resolveRelativeImport(file, statement.source.value);
    const reachesALiveHalf =
      target !== undefined && liveHalfFiles.has(path.relative(REPO_ROOT, target));

    if (namesTheRunner || reachesALiveHalf) {
      const statementText = text.slice(statement.start ?? 0, statement.end ?? 0);
      reaches.push(`${path.relative(REPO_ROOT, file)}: ${statementText}`);
    }
  }

  return reaches;
}

/** Every top-level `import ... from '...'` statement of a TypeScript source, in written order. */
function importsIn(text: string): babel.ImportDeclaration[] {
  const { program } = parse(text, { sourceType: 'module', plugins: ['typescript'] });
  return program.body.filter(
    (statement): statement is babel.ImportDeclaration => statement.type === 'ImportDeclaration'
  );
}

/** The name an `import { a as b }` takes from its module: `a`. */
function importedName(specifier: babel.ImportSpecifier): string {
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

/** `packages/cli/src/commands/pose/foo.ts` -> true for the directory `commands/pose`. */
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

  it('the named exceptions are exactly the modules a pose can never reach - the devtools - each with its reason', async () => {
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
      const findings = lintWithTheDoorRulesAlone([path.relative(REPO_ROOT, scratchFile)]);

      expect(
        findings.some((finding) => finding.ruleId === 'no-restricted-imports'),
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
    // The sim road opens its build through the open the staged road shares with it.
    const startTheTestSource = fs.readFileSync(
      path.join(CLI_SRC, 'commands/test/startTheTest.ts'),
      'utf8'
    );

    expect(simRunSource).toMatch(/\bopenAndEndTheTest\(/);
    expect(startTheTestSource).toMatch(/serverCalls\(\)\s*\.\s*openBuild\(/);
    expect(simRunSource).toMatch(/serverCalls\(\)\s*\.\s*getStagedUploadUrls\(/);
    for (const source of [simRunSource, startTheTestSource]) {
      expect(source).not.toMatch(/\bclient\.(openBuild|getStagedUploadUrls)\(/);
    }

    // --emit-bundle-dir bundles through the SAME bundler seam the built road uses (a fourth
    // bypass found while proving this file's own reach claim, below) - never the real bundler.
    const emitBundleDirSource = fs.readFileSync(
      path.join(CLI_SRC, 'commands/test/emitBundleDir.ts'),
      'utf8'
    );
    expect(emitBundleDirSource).toMatch(/bundler\(\)\s*\.\s*bundleFor\(/);
    expect(emitBundleDirSource).not.toMatch(/buildBundleForPlatform\(/);
  });

  it('no init module reaches the shell runner outside the workstation seam, even through a re-export', () => {
    // The import census above follows a file to the module it names, so a command importing
    // `runShellCommand` from the `helpers` index is invisible to it - which is exactly how setup
    // once ran a real `pod install` under a pose. So here the NAME is the door: no module under
    // commands/init may import `runShellCommand` from anywhere, or any live half by path.
    const initDir = path.join(CLI_SRC, 'commands/init');
    const reaches = listSourceFiles(initDir)
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
      .flatMap((file) => shellRunnerImports(file, fs.readFileSync(file, 'utf8')));

    // CONTROL: the scan still sees the import setup's pod install was written with before it
    // became a seam act, so an empty list above means a clean tree, not a blind scan.
    const podInstallBeforeTheSeam = "import { getCwd, runShellCommand } from '../../../helpers';";
    expect(
      shellRunnerImports(path.join(initDir, 'dependencies/installPods.ts'), podInstallBeforeTheSeam)
    ).toHaveLength(1);

    expect(
      reaches,
      reaches.length > 0
        ? `These init modules reach the shell runner without the workstation seam:\n  ${reaches.join(
            '\n  '
          )}\nAdd the act to src/seams/workstation.ts and call it through workstation().`
        : undefined
    ).toEqual([]);

    // And the two installs are the seam's acts, by name.
    const initSource = (relative: string) => fs.readFileSync(path.join(initDir, relative), 'utf8');
    expect(initSource('dependencies/installSherlo.ts')).toMatch(
      /workstation\(\)\s*\.\s*addPackage\(/
    );
    expect(initSource('dependencies/installPods.ts')).toMatch(
      /workstation\(\)\s*\.\s*installPods\(/
    );
  });

  it('each live half is reached only from its seam or from another live half', () => {
    const edges = findValueImportEdges();
    const liveHalfFiles = new Set(LIVE_HALF_SET.map((entry) => `packages/cli/src/${entry.file}`));

    for (const entry of LIVE_HALF_SET) {
      const target = `packages/cli/src/${entry.file}`;
      const seamFile = `packages/cli/src/${SEAM_FILE[entry.seam]}`;
      const importers = edges.filter(
        (e) =>
          e.to === target &&
          e.from !== target &&
          !e.from.includes(`${path.sep}__tests__${path.sep}`)
      );

      const stray = importers.filter((e) => {
        if (e.from === seamFile) return false;
        if (liveHalfFiles.has(e.from)) return false;
        return !ALLOWED_ADDITIONAL_IMPORTERS.some(
          (allowed) =>
            `packages/cli/src/${allowed.file}` === e.from &&
            `packages/cli/src/${allowed.of}` === target
        );
      });

      expect(
        stray,
        stray.length > 0
          ? `${entry.file} (the live half of ${entry.seam}) is imported by ${stray
              .map((e) => e.from)
              .join(', ')}, which is neither ${SEAM_FILE[entry.seam]}, another live half, ` +
              'nor a named ALLOWED_ADDITIONAL_IMPORTERS entry. Route it through the seam, or name ' +
              'it with its reason.'
          : undefined
      ).toEqual([]);
    }

    for (const allowed of ALLOWED_ADDITIONAL_IMPORTERS) {
      expect(
        allowed.reason.length,
        `${allowed.file} -> ${allowed.of} is missing a reason`
      ).toBeGreaterThan(0);
      expect(
        edges.some(
          (e) =>
            e.from === `packages/cli/src/${allowed.file}` &&
            e.to === `packages/cli/src/${allowed.of}`
        ),
        `${allowed.file} is named as importing ${allowed.of}, but no such import exists - drop it`
      ).toBe(true);
    }
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
