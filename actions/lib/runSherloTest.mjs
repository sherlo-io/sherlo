#!/usr/bin/env node
/**
 * The body of the Sherlo GitHub Action: repair a shallow checkout, run
 * `sherlo test` once, then publish what it said as step outputs.
 *
 * This script is the glue - every decision it makes lives in a unit-tested module
 * next to it (./cliEntry.mjs, ./deepenCheckout.mjs, ./testCommand.mjs,
 * ./cliOutputs.mjs).
 *
 * IT ABSORBS THE EXIT-CODE TRAP. `sherlo test` exits 4 to mean "a native build is
 * needed first", which is an ANSWER, not a failure. This script never lets the
 * CLI's exit code become the step's exit code: it exits 0 for every routing
 * outcome and 1 only when the CLI produced no answer at all (a genuine tool
 * error). The workflow routes on the `native-needed` OUTPUT.
 *
 * Inputs arrive as env vars set by action.yml - a token never becomes a visible
 * argument in the log, and there is no argument parsing to get wrong.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolveCliEntry } from './cliEntry.mjs';
import { deepenShallowCheckout } from './deepenCheckout.mjs';
import { buildTestArgs } from './testCommand.mjs';
import { formatOutputFileLines, readRunResult } from './cliOutputs.mjs';

main();

async function main() {
  try {
    // WHICH CLI RAN, first line of the log. The project's own install wins when it
    // has one; otherwise the action runs the copy it carries at this ref. A reader
    // must never have to guess which of the two produced the results.
    const cli = resolveCliEntry(process.cwd());
    const origin =
      cli.source === 'project' ? 'installed in your project' : 'carried by this action';
    console.log(`Sherlo CLI: ${cli.packageName}@${cli.version} (${origin})`);
    console.log(`            ${cli.entry}`);

    // Both roads run the CLI through here, so the shallow-checkout repair sits
    // here too - once, ahead of the verb, for every event. On a full clone it is
    // one `git rev-parse` and nothing more; when it cannot repair a shallow one
    // it warns and returns, because the CLI survives a shallow clone.
    deepenShallowCheckout({ workingDirectory: process.cwd() });

    const args = buildTestArgs({
      token: process.env.SHERLO_TOKEN,
      config: process.env.SHERLO_CONFIG,
      projectRoot: process.env.SHERLO_PROJECT_ROOT,
      android: process.env.SHERLO_ANDROID,
      ios: process.env.SHERLO_IOS,
      bundleDir: process.env.SHERLO_BUNDLE_DIR,
      emitBundleDir: process.env.SHERLO_EMIT_BUNDLE_DIR,
    });

    const { exitCode, output } = await runCli(cli.entry, args);
    console.log(`\nsherlo test exited with code ${exitCode}`);

    // Throws when the CLI answered nothing - see readRunResult.
    const { outputs } = readRunResult({ exitCode, output });

    publishOutputs(outputs);
    describeAnswer(outputs);
  } catch (error) {
    console.log(`::error title=Sherlo::${error.message.replace(/\r?\n/g, ' ')}`);
    process.exitCode = 1;
  }
}

/* ========================================================================== */

/**
 * Run the CLI, streaming its output into the live workflow log AND capturing it
 * for parsing. Both streams are captured in arrival order, so a key printed to
 * stdout is read even when the CLI is also writing to stderr.
 *
 * Never rejects on a non-zero exit: judging the exit code is readRunResult's job.
 */
function runCli(entry, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const capture = (stream, mirror) => {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        output += chunk;
        mirror.write(chunk);
      });
    };

    capture(child.stdout, process.stdout);
    capture(child.stderr, process.stderr);

    child.on('error', reject);
    child.on('close', (code, signal) => {
      // A signal-killed child reports a null code; report it as a failure so it
      // can never be mistaken for the clean exit 0.
      resolve({ exitCode: code === null ? `signal ${signal}` : code, output });
    });
  });
}

/** Make the CLI's keys available to later steps as `steps.<id>.outputs.<key>`. */
function publishOutputs(outputs) {
  const lines = formatOutputFileLines(outputs);
  if (!lines) return;

  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    // Outside GitHub Actions (a local run of this script): show them instead.
    console.log(`\nOutputs:\n${lines}`);
    return;
  }

  fs.appendFileSync(outputFile, lines);
}

/** One line in the log saying what the run means, for a human reading it later. */
function describeAnswer(outputs) {
  const nativeNeeded = outputs['native-needed'];

  if (nativeNeeded === 'false') {
    console.log('\nTested JS-only - no native build was needed');
  } else if (nativeNeeded === 'true') {
    console.log('\nA native build is needed before this commit can be tested');
  }

  if (outputs.reason) console.log(`   ${outputs.reason}`);
  if (outputs.url) console.log(`   ${outputs.url}`);
}
