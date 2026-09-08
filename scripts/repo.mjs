#!/usr/bin/env node
/**
 * `yarn repo <section> <verb>` - THIS REPO'S OWN DOOR ONTO THE WORK STAGES (decided
 * 2026-09-07). Every product repo carries the same two sections, spelled the same way:
 *
 *   plan     produce what the PLANNED report draws from this repo - here, a TRANSCRIPT: what the
 *            shipped CLI prints for a scenario it names, or for a state a caller declares
 *   explore  drive this repo's own surface by hand - run the built CLI
 *
 * WHY THE CLI HAS THIS AND THE TESTER DOES NOT DO IT FOR US. A kept-output expectation is what the
 * CLI's OWN formatter prints, and only the CLI can say what that is: a hand-typed fixture is a
 * second copy that drifts silently. The tester used to reach into this repo for the built dist and
 * the scenario catalog; the repo that owns a surface owns the producer for it, so the tester calls
 * this verb, and so does anyone drafting a new screen of output before it ships.
 *
 * WHY IT RUNS NOTHING BUT THE RENDERER. `sherlo test --dry-run --render-transcript` supplies the
 * three effects a dry run performs (bundle, git, one read-only question) from a script and runs the
 * shipped code over them. No device, no token, no network - the same bytes on every machine, and
 * the producer renders twice and refuses if the two passes disagree.
 *
 *   yarn repo plan transcript list
 *   yarn repo plan transcript <scenarioId> [--out <file>]
 *   yarn repo plan transcript --state <pose.json|-> [--out <file>]
 *   yarn repo explore run <sherlo args...>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_BIN = path.join(REPO_ROOT, "packages/cli/cli.js");
const CLI_DIST = path.join(REPO_ROOT, "packages/cli/dist/index.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`yarn repo <section> <verb>

plan
  transcript list                         Every scenario the shipped CLI can render, by family.
  transcript <scenarioId> [--out <file>]  Render one named scenario through the CLI's own dry-run
                                          code: the transcript on stdout, its envelope (family,
                                          exit code, command, sha256) on stderr.
  transcript --state <pose.json|->        Render a transcript for a state you declare (the view
                                          family; see contracts/transcript.contract.ts).

explore
  run <sherlo args...>                    Run the built CLI by hand: yarn repo explore run view 12 --token ...

The CLI must be BUILT first - the dist is the renderer: yarn workspace sherlo build`);
}

function requireBuiltCli() {
  if (fs.existsSync(CLI_DIST)) return;
  fail(
    `${path.relative(REPO_ROOT, CLI_DIST)} is not there - the built dist is the renderer, and a transcript\n` +
      "rendered by anything else would be evidence about the wrong thing. Build it first:\n" +
      "  yarn workspace sherlo build",
  );
}

/** Run the built CLI, inheriting the terminal, and return its exit code. */
function runCli(args, options = {}) {
  requireBuiltCli();
  const result = spawnSync("node", [CLI_BIN, ...args], { cwd: REPO_ROOT, stdio: options.stdio ?? "inherit", encoding: "utf8", env: { ...process.env, SKIP_INTRO: "true" } });
  return result;
}

function planTranscript(rest) {
  const outIndex = rest.indexOf("--out");
  const out = outIndex === -1 ? null : rest[outIndex + 1];
  const args = outIndex === -1 ? rest : [...rest.slice(0, outIndex), ...rest.slice(outIndex + 2)];

  const stateIndex = args.indexOf("--state");
  const cliArgs =
    stateIndex === -1
      ? ["test", "--dry-run", "--render-transcript", args[0] ?? "list"]
      : ["test", "--dry-run", "--render-transcript-state", args[stateIndex + 1] ?? "-"];

  if (!out) {
    const result = runCli(cliArgs);
    process.exit(result.status ?? 1);
  }

  // With --out the transcript goes to the file and the envelope stays on stderr, so a caller
  // that wants both never has to split one stream.
  const result = runCli(cliArgs, { stdio: ["inherit", "pipe", "inherit"] });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), result.stdout);
  console.log(`transcript  ${path.resolve(out)}`);
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
if (section === "plan" && verb === "transcript") planTranscript(rest);
else if (section === "explore" && verb === "run") exploreRun(rest);
else {
  usage();
  fail(`\nunknown: yarn repo ${[section, verb].filter(Boolean).join(" ")}`);
}
