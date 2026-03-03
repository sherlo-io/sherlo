/**
 * Spike: Raw readline with completer for TAB path completion
 * SHERLO-461
 *
 * Run: npx tsx spikes/readline-completer.ts
 *
 * Tests Node.js built-in readline module with a completer function
 * for file path TAB completion when entering build paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const BUILD_EXTENSIONS = ['.apk', '.app', '.tar.gz', '.tar'];

function pathCompleter(line: string): [string[], string] {
  // Resolve the partial path the user has typed
  const trimmed = line.trim();

  if (trimmed === '') {
    // Show current directory contents
    return completeFromDir('.', '');
  }

  const resolved = path.resolve(trimmed);

  // Check if the typed path is an existing directory (with or without trailing slash)
  try {
    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      // Complete from inside this directory
      return completeFromDir(resolved, trimmed.endsWith('/') ? trimmed : trimmed + '/');
    }
  } catch {
    // Not an existing path - complete the partial name
  }

  // Split into directory + partial filename
  const dir = path.dirname(resolved);
  const partial = path.basename(resolved).toLowerCase();
  const inputDir = path.dirname(trimmed);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const matches: string[] = [];

    for (const entry of entries) {
      const name = entry.name;
      if (name.toLowerCase().startsWith(partial) && !name.startsWith('.')) {
        const prefix = inputDir === '.' && !trimmed.includes('/') ? '' : inputDir + '/';
        if (entry.isDirectory()) {
          matches.push(prefix + name + '/');
        } else if (isBuildFile(name)) {
          matches.push(prefix + name);
        }
      }
    }

    // If exactly one match and it's a directory, recurse into it
    if (matches.length === 1 && matches[0].endsWith('/')) {
      return completeFromDir(path.resolve(matches[0]), matches[0]);
    }

    return [matches, trimmed];
  } catch {
    return [[], trimmed];
  }
}

function completeFromDir(dirPath: string, prefix: string): [string[], string] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const matches: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        matches.push(prefix + entry.name + '/');
      } else if (isBuildFile(entry.name)) {
        matches.push(prefix + entry.name);
      }
    }

    return [matches, prefix];
  } catch {
    return [[], prefix];
  }
}

function isBuildFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return BUILD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function askBuildPath(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: pathCompleter,
      terminal: true,
    });

    rl.question(prompt, (answer) => {
      rl.close();

      const trimmed = answer.trim();
      if (!trimmed) {
        reject(new Error('No path provided'));
        return;
      }

      const resolved = path.resolve(trimmed);

      // Validate: file exists
      try {
        const stats = fs.statSync(resolved);
        if (!stats.isFile()) {
          reject(new Error(`Path "${trimmed}" is a directory, not a file`));
          return;
        }
      } catch {
        reject(new Error(`File not found: "${trimmed}" (resolved: ${resolved})`));
        return;
      }

      // Validate: correct extension
      if (!isBuildFile(trimmed)) {
        reject(
          new Error(
            `Invalid extension. Expected: ${BUILD_EXTENSIONS.join(', ')} - got: "${path.extname(trimmed)}"`
          )
        );
        return;
      }

      resolve(trimmed);
    });

    // Handle Ctrl+C
    rl.on('close', () => {
      // Already handled by question callback
    });
  });
}

// --- Main ---

async function main() {
  console.log('=== Spike: readline completer for build path TAB completion ===');
  console.log('Type a path and press TAB to autocomplete.');
  console.log(`Filters for build files: ${BUILD_EXTENSIONS.join(', ')}`);
  console.log('Press Ctrl+C to exit.\n');

  try {
    const iosPath = await askBuildPath('Enter iOS build path (.app, .tar.gz, .tar): ');
    console.log(`\n  iOS path: ${iosPath}`);
    console.log(`  Resolved: ${path.resolve(iosPath)}\n`);
  } catch (err: any) {
    console.error(`\n  Error: ${err.message}\n`);
  }

  try {
    const androidPath = await askBuildPath('Enter Android build path (.apk): ');
    console.log(`\n  Android path: ${androidPath}`);
    console.log(`  Resolved: ${path.resolve(androidPath)}\n`);
  } catch (err: any) {
    console.error(`\n  Error: ${err.message}\n`);
  }
}

main();
