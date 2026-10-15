#!/usr/bin/env node
/**
 * `yarn repo <section> <verb>` - THIS REPO'S OWN DOOR ONTO THE WORK STAGES.
 *
 *   explore  drive this repo's own surface by hand - run the built CLI
 *
 *   yarn repo explore run <sherlo args...>
 *
 * Producing what a planned report needs from this repo - the whole screen the shipped CLI would
 * put on a terminal for one command against a declared world - is `sherlo pose <pose.json|->`
 * (hidden unless SHERLO_DEVTOOLS=1) now, run directly rather than through a verb here: see
 * `packages/cli/poses/README.md`.
 */
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_BIN = path.join(REPO_ROOT, "packages/cli/cli.js");
const CLI_DIST = path.join(REPO_ROOT, "packages/cli/dist/index.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`yarn repo <section> <verb>

explore
  run <sherlo args...>                    Run the built CLI by hand: yarn repo explore run view 12 --token ...

The CLI must be BUILT first - the dist is the renderer: yarn workspace sherlo build`);
}

function requireBuiltCli() {
  if (fs.existsSync(CLI_DIST)) return;
  fail(
    `${path.relative(REPO_ROOT, CLI_DIST)} is not there - the built dist is the renderer, and a run\n` +
      "against anything else would be evidence about the wrong thing. Build it first:\n" +
      "  yarn workspace sherlo build",
  );
}

/** Run the built CLI, inheriting the terminal, and return its exit code. */
function runCli(args, options = {}) {
  requireBuiltCli();
  const result = spawnSync("node", [CLI_BIN, ...args], { cwd: REPO_ROOT, stdio: options.stdio ?? "inherit", encoding: "utf8", env: { ...process.env, SKIP_INTRO: "true" } });
  return result;
}

function exploreRun(rest) {
  if (rest.length === 0) fail("explore run needs the sherlo arguments: yarn repo explore run view 12 --token <t>");
  const result = runCli(rest);
  process.exit(result.status ?? 1);
}

const [section, verb, ...rest] = process.argv.slice(2);

if (!section || section === "--help" || section === "help") {
  usage();
  process.exit(0);
}
if (section === "explore" && verb === "run") exploreRun(rest);
else {
  usage();
  fail(`\nunknown: yarn repo ${[section, verb].filter(Boolean).join(" ")}`);
}
