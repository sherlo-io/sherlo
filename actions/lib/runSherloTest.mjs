#!/usr/bin/env node
/**
 * The body of the Sherlo GitHub Action: repair a shallow checkout, run
 * `sherlo test` once, then publish the review address as the `url` output.
 *
 * This script is the glue - every decision it makes lives in a unit-tested module
 * next to it (./cliEntry.mjs, ./deepenCheckout.mjs, ./testCommand.mjs).
 *
 * THE STEP EXITS WITH THE CLI'S OWN CODE: 0 once the run is open or joined, or when
 * the job has nothing to test; 1 for a refusal; 2 for a failed app build.
 *
 * Inputs arrive as env vars set by action.yml. The token is not one of them: the CLI
 * reads SHERLO_TOKEN from the job's own environment.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolveCliEntry } from './cliEntry.mjs';
import { deepenShallowCheckout } from './deepenCheckout.mjs';
import { buildTestArgs } from './testCommand.mjs';

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

    // On a full clone this is one `git rev-parse` and nothing more; when it cannot
    // repair a shallow one it warns and returns, because the CLI survives a shallow clone.
    deepenShallowCheckout({ workingDirectory: process.cwd() });

    const args = buildTestArgs({
      platform: process.env.SHERLO_PLATFORM,
      config: process.env.SHERLO_CONFIG,
      projectRoot: process.env.SHERLO_PROJECT_ROOT,
      bundleDir: process.env.SHERLO_BUNDLE_DIR,
      emitBundleDir: process.env.SHERLO_EMIT_BUNDLE_DIR,
    });

    const { exitCode, output } = await runCli(cli.entry, args);
    console.log(`\nsherlo test exited with code ${exitCode}`);

    const url = findReviewUrl(output);
    if (url) publishUrl(url);

    // A signal-killed CLI has no code; that is a failure, never a clean 0.
    process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
  } catch (error) {
    console.log(`::error title=Sherlo::${error.message.replace(/\r?\n/g, ' ')}`);
    process.exitCode = 1;
  }
}

/* ========================================================================== */

/**
 * Run the CLI, streaming its output into the live workflow log AND capturing it
 * for parsing. Both streams are captured in arrival order.
 *
 * Never rejects on a non-zero exit: the exit code is passed on as it is.
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
      resolve({ exitCode: code === null ? `signal ${signal}` : code, output });
    });
  });
}

/** Colour codes, so a coloured line still parses (the CLI drops colour off a TTY). */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** The CLI prints the review address of the run it opened or joined as `🔗 Review: <url>`. */
const REVIEW_LINE_PATTERN = /^\u{1F517} Review:\s*(https?:\/\/\S+)$/u;

/** The last review address in the CLI's screen, or undefined when it printed none. */
function findReviewUrl(output) {
  let url;

  for (const rawLine of output.split('\n')) {
    const match = REVIEW_LINE_PATTERN.exec(rawLine.replace(ANSI_PATTERN, '').trim());
    if (match) url = match[1];
  }

  return url;
}

/** Make the address available to later steps as `steps.<id>.outputs.url`. */
function publishUrl(url) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    // Outside GitHub Actions (a local run of this script): show it instead.
    console.log(`\nurl=${url}`);
    return;
  }

  fs.appendFileSync(outputFile, `url=${url}\n`);
}
