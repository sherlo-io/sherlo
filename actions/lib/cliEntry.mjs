/**
 * Find the Sherlo CLI this run should execute.
 *
 * TWO PLACES, IN THIS ORDER:
 *
 *   1. THE PROJECT'S OWN INSTALL. Whatever `sherlo` the project's lockfile pinned,
 *      resolved from the working directory. When one is there it always wins, so a
 *      workflow's test run matches the developer's local run exactly and the CLI
 *      stays version-coherent with the SDK the app was built with.
 *   2. THE COPY THIS ACTION CARRIES, at `actions/carried-cli`. Release refs commit a
 *      built CLI there (see the release workflows), so `uses: sherlo-io/sherlo@<ref>`
 *      works in a job that installed no dependencies at all - no `yarn install` just
 *      to hand the action a CLI to find.
 *
 * Which one ran is printed at the top of every run: a reader of a CI log must never
 * have to guess which CLI produced the results.
 *
 * Resolution is by NODE, from a root directory, and never through PATH - because the
 * two install shapes we support put different names on PATH:
 *
 *   normal install    "sherlo": "^2.0.0"                -> bin linked as `sherlo`
 *   aliased install   "sherlo": "npm:@sherlo-io/cli@x"  -> bin linked as `cli`
 *
 * The alias is the test channel: npm installs the package into `node_modules/sherlo`
 * but the package's own name is `@sherlo-io/cli`, and a STRING `bin` takes its name
 * from the package, so the linked binary is `cli`. Both shapes are identical to
 * node's resolver, which looks up the DIRECTORY name - hence resolving
 * `sherlo/package.json` and reading its `bin` field, rather than looking for a
 * command called `sherlo` or hardcoding `node_modules/sherlo/cli.js`.
 *
 * The carried copy is installed into `actions/carried-cli/node_modules/sherlo`, i.e.
 * the SAME shape, which is why both places are found by one function.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** The directory name inside node_modules, which every install shape shares. */
const CLI_PACKAGE_DIR = 'sherlo';

/** Where a release ref commits the built CLI, relative to this file. */
export const CARRIED_CLI_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'carried-cli'
);

/**
 * Resolve the CLI to run, preferring the project's install over the carried copy.
 *
 * Returns the absolute `entry` script to run with node, the `packageName` and
 * `version` that were actually resolved, and `source` - 'project' or 'carried'.
 *
 * Throws when NEITHER place has a CLI, naming both places it looked. A project
 * install that is present but BROKEN (its manifest points at a script that is not on
 * disk, or declares no `bin`) throws too rather than falling through: silently
 * running a different CLI than the one the project pinned would be worse than
 * stopping with a sentence that names the fix.
 */
export function resolveCliEntry(workingDirectory, carriedCliRoot = CARRIED_CLI_ROOT) {
  const projectCli = describeCli(findProjectCliManifest(workingDirectory));
  if (projectCli) return { ...projectCli, source: 'project' };

  const carriedCli = describeCli(findCarriedCliManifest(carriedCliRoot));
  if (carriedCli) return { ...carriedCli, source: 'carried' };

  throw new Error(
    `No Sherlo CLI found. Looked in your project (${path.resolve(workingDirectory)}) and in ` +
      `the copy this action carries (${path.resolve(carriedCliRoot)}). Install the CLI in ` +
      'your project (`npm install --save-dev sherlo`) and run the action after your install ' +
      "step, point `working-directory` at the project's root, or pin the action at a release " +
      'ref, which carries a CLI of its own.'
  );
}

/* ========================================================================== */

/**
 * The project's installed CLI manifest, or null when the project has none.
 *
 * Resolved by node FROM the working directory, so it walks node_modules upward and a
 * nested working directory in a monorepo finds the CLI hoisted at the repo root.
 */
function findProjectCliManifest(workingDirectory) {
  const requireFromProject = createRequire(
    path.join(path.resolve(workingDirectory), 'resolve-from-here.js')
  );

  try {
    return requireFromProject.resolve(`${CLI_PACKAGE_DIR}/package.json`);
  } catch {
    return null;
  }
}

/**
 * The carried CLI's manifest, or null when this ref carries none (every ref that is
 * not a release ref).
 *
 * Looked up as an EXACT path rather than resolved by node: an upward walk from the
 * action's own directory would climb out of the action and could find some other
 * checkout's `node_modules/sherlo`, which is not a copy this action carries.
 */
function findCarriedCliManifest(carriedCliRoot) {
  const manifestPath = path.join(
    path.resolve(carriedCliRoot),
    'node_modules',
    CLI_PACKAGE_DIR,
    'package.json'
  );

  return fs.existsSync(manifestPath) ? manifestPath : null;
}

/** The runnable identity of the CLI whose manifest is at `manifestPath`. */
function describeCli(manifestPath) {
  if (!manifestPath) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const binField = readBinPath(manifest);

  if (!binField) {
    throw new Error(
      `The package installed as node_modules/${CLI_PACKAGE_DIR} (${manifest.name}@${manifest.version}) ` +
        'declares no `bin`, so it is not the Sherlo CLI.'
    );
  }

  const entry = path.join(path.dirname(manifestPath), binField);

  if (!fs.existsSync(entry)) {
    throw new Error(
      `The Sherlo CLI (${manifest.name}@${manifest.version}) points its \`bin\` at ${binField}, ` +
        `which is missing from ${path.dirname(manifestPath)}. Reinstall your dependencies.`
    );
  }

  return { entry, packageName: manifest.name, version: manifest.version };
}

/**
 * The path a package's `bin` field points at.
 *
 * A string bin is the whole answer. An object bin is keyed by COMMAND name, which
 * differs between the two install shapes (`sherlo` vs `cli`), so the entry is
 * taken by position rather than by guessing a key - a CLI package publishes one
 * executable.
 */
function readBinPath(manifest) {
  if (typeof manifest.bin === 'string') return manifest.bin;

  if (manifest.bin && typeof manifest.bin === 'object') {
    return Object.values(manifest.bin)[0] ?? null;
  }

  return null;
}
