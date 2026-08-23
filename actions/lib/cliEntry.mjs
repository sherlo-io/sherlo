/**
 * Find the entry point of the Sherlo CLI the PROJECT has installed.
 *
 * The action never bundles a CLI and never installs one: it runs whatever
 * `sherlo` the project's own lockfile pinned, so a workflow's test run matches
 * the developer's local run exactly.
 *
 * Resolution is by NODE, from the working directory, and never through PATH -
 * because the two install shapes we support put different names on PATH:
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
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** The directory name inside node_modules, which both install shapes share. */
const CLI_PACKAGE_DIR = 'sherlo';

/**
 * Resolve the CLI's entry script as seen from `workingDirectory`.
 *
 * Returns the absolute `entry` script to run with node, plus the `packageName`
 * and `version` that were actually resolved - print them, so a CI log says which
 * channel (and which release) produced its results.
 *
 * Throws when no CLI is installed there, or when its manifest points at a script
 * that is not on disk: a wrong path must fail here, with a sentence naming the
 * fix, rather than as an unreadable "cannot find module" from node.
 */
export function resolveCliEntry(workingDirectory) {
  const requireFromProject = createRequire(
    path.join(path.resolve(workingDirectory), 'resolve-from-here.js')
  );

  const manifestPath = resolveOrNull(requireFromProject, `${CLI_PACKAGE_DIR}/package.json`);

  if (!manifestPath) {
    throw new Error(
      `No Sherlo CLI found in ${path.resolve(workingDirectory)}. ` +
        'Install it in your project (`npm install --save-dev sherlo`) and run the ' +
        "action after your install step, or point `working-directory` at the project's root."
    );
  }

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

/* ========================================================================== */

function resolveOrNull(requireFromProject, request) {
  try {
    return requireFromProject.resolve(request);
  } catch {
    return null;
  }
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
