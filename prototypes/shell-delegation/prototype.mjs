/**
 * Prototype: Shell delegation (bash read -e)
 * SHERLO-462
 *
 * Usage: node prototype.mjs
 *
 * Approach: Spawn a bash subprocess with `read -e` which enables native
 * readline TAB completion for file paths. The result is captured via a
 * temp file (since stdio must be inherited for readline to work).
 *
 * Cross-platform notes:
 * - macOS: bash 3.2 ships with the OS, `read -e` supported
 * - Linux: bash 4+, `read -e` supported
 * - Windows: requires Git Bash or WSL; native cmd.exe has no `read -e`
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';

// --- Helpers ---

function createTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-shell-'));
  const file = path.join(dir, 'result');
  return { dir, file };
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true });
  } catch {
    // Best effort cleanup
  }
}

/**
 * Prompt user for a file path using bash's native readline (read -e).
 *
 * @param {string} prompt - The prompt text to display
 * @returns {{ value: string, cancelled: boolean }}
 */
function bashReadline(prompt) {
  const { dir, file: tmpFile } = createTempFile();

  try {
    // Build a bash script that:
    // 1. Uses `read -e` for readline with TAB completion
    // 2. Writes the result to a temp file
    // 3. Handles Ctrl+C gracefully
    const script = [
      // Trap Ctrl+C - write empty marker and exit
      `trap 'echo "__CANCELLED__" > "${tmpFile}"; exit 130' INT`,
      // Use read -e for readline TAB completion, -p for prompt text
      `read -e -p ${shellQuote(prompt)} REPLY`,
      // Write result to temp file
      `echo "$REPLY" > "${tmpFile}"`,
    ].join('\n');

    const result = spawnSync('bash', ['-c', script], {
      stdio: 'inherit',
      // Ensure bash can access the terminal
      env: { ...process.env },
    });

    // Check if temp file was written
    if (!fs.existsSync(tmpFile)) {
      return { value: '', cancelled: true };
    }

    const value = fs.readFileSync(tmpFile, 'utf-8').trim();

    if (value === '__CANCELLED__' || result.status === 130) {
      return { value: '', cancelled: true };
    }

    return { value, cancelled: false };
  } finally {
    cleanup(dir);
  }
}

function shellQuote(s) {
  // Single-quote the string for bash, escaping any existing single quotes
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// --- Main ---

console.log();
console.log(chalk.bold('Prototype: Shell delegation (bash read -e)'));
console.log(chalk.dim('SHERLO-462'));
console.log();
console.log(chalk.dim('Native bash readline - press TAB for file/directory completion.'));
console.log(chalk.dim('Double-TAB shows all matches. Ctrl+C to cancel.'));
console.log();

// Check if bash is available
const bashCheck = spawnSync('bash', ['--version'], { stdio: 'pipe' });
if (bashCheck.status !== 0) {
  console.log(chalk.red('Error: bash is not available on this system.'));
  console.log(chalk.dim('This approach requires bash (macOS, Linux, or Git Bash on Windows).'));
  process.exit(1);
}

const bashVersion = bashCheck.stdout.toString().split('\n')[0];
console.log(chalk.dim(`Using: ${bashVersion}`));
console.log();

// Prompt for iOS build path
const { value: iosPath, cancelled: iosCancelled } = bashReadline(
  '? Enter path to iOS build (.app, .tar.gz): '
);

if (iosCancelled) {
  console.log();
  console.log(chalk.yellow('Cancelled.'));
  process.exit(0);
}

if (!iosPath) {
  console.log(chalk.red('No path entered.'));
  process.exit(1);
}

// Validate file exists
const resolvedIos = path.resolve(iosPath);
if (!fs.existsSync(resolvedIos)) {
  console.log(chalk.red(`File does not exist: ${iosPath}`));
  console.log(chalk.dim(`Resolved: ${resolvedIos}`));
  process.exit(1);
}

console.log();
console.log(`${chalk.green('\u2714')} Selected: ${chalk.cyan(iosPath)}`);
console.log(`  Resolved: ${chalk.dim(resolvedIos)}`);

// Prompt for Android build path (to test multi-prompt flow)
console.log();

const { value: androidPath, cancelled: androidCancelled } = bashReadline(
  '? Enter path to Android build (.apk): '
);

if (androidCancelled) {
  console.log();
  console.log(chalk.yellow('Cancelled.'));
  process.exit(0);
}

if (!androidPath) {
  console.log(chalk.red('No path entered.'));
  process.exit(1);
}

const resolvedAndroid = path.resolve(androidPath);
if (!fs.existsSync(resolvedAndroid)) {
  console.log(chalk.red(`File does not exist: ${androidPath}`));
  console.log(chalk.dim(`Resolved: ${resolvedAndroid}`));
  process.exit(1);
}

console.log();
console.log(`${chalk.green('\u2714')} Selected: ${chalk.cyan(androidPath)}`);
console.log(`  Resolved: ${chalk.dim(resolvedAndroid)}`);

// Summary
console.log();
console.log(chalk.bold('Summary:'));
console.log(`  iOS:     ${chalk.cyan(resolvedIos)}`);
console.log(`  Android: ${chalk.cyan(resolvedAndroid)}`);
