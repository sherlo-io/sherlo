/**
 * Prototype: raw readline with completer for TAB file path autocomplete
 * SHERLO-461
 *
 * Usage: node prototype.mjs
 *
 * Features:
 * - TAB completes file paths using readline's native completer mechanism
 * - Single match = full complete (with trailing / for directories)
 * - Multiple matches = readline displays candidates automatically
 * - Uses Node.js built-in readline only (no framework)
 */

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

// --- File completion logic ---

function completer(line) {
  if (!line) {
    // Empty input - list current directory entries
    try {
      const entries = fs.readdirSync('.', { withFileTypes: true });
      const hits = entries.map((e) => (e.isDirectory() ? e.name + '/' : e.name));
      return [hits, line];
    } catch {
      return [[], line];
    }
  }

  const resolved = path.resolve(line);
  const dir = line.endsWith('/') ? resolved : path.dirname(resolved);
  const prefix = line.endsWith('/') ? '' : path.basename(resolved);

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [[], line];
  }

  const matches = entries.filter((e) => e.name.startsWith(prefix));

  if (matches.length === 0) {
    return [[], line];
  }

  // Build completions as full paths (relative or absolute, matching user input style)
  const isAbs = path.isAbsolute(line);
  const dirForJoin = line.endsWith('/') ? line : line.slice(0, line.length - prefix.length);

  const completions = matches.map((e) => {
    const name = e.isDirectory() ? e.name + '/' : e.name;
    return dirForJoin + name;
  });

  return [completions, line];
}

// --- Prompt helper ---

function askPath(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer,
      terminal: true,
    });

    rl.question(chalk.green('? ') + chalk.bold(question) + ' ', (answer) => {
      rl.close();
      resolve(answer);
    });

    // Handle Ctrl+C
    rl.on('close', () => {
      // If no answer was given, the promise just won't resolve via question callback
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Cancelled'));
    });
  });
}

// --- Validate path ---

function validatePath(input) {
  if (!input) return 'Path is required';
  const resolved = path.resolve(input);
  try {
    fs.statSync(resolved);
    return null;
  } catch {
    return `File does not exist at "${input}" ${chalk.dim(`(${resolved})`)}`;
  }
}

// --- Run the prototype ---

console.log();
console.log(chalk.bold('Prototype: raw readline with TAB path completer'));
console.log(chalk.dim('Press TAB to autocomplete file paths. Press Enter to submit.'));
console.log();

try {
  let result;
  while (true) {
    result = await askPath('Enter path to iOS build (.app, .tar.gz):');

    const error = validatePath(result);
    if (!error) break;

    console.log(chalk.red(`> ${error}`));
  }

  console.log();
  console.log(`${chalk.green('✔')} Selected: ${chalk.cyan(result)}`);
  console.log(`  Resolved: ${chalk.dim(path.resolve(result))}`);
} catch (err) {
  if (err.message === 'Cancelled') {
    console.log();
    console.log(chalk.yellow('Cancelled.'));
  } else {
    throw err;
  }
}
