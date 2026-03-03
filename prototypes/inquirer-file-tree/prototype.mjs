/**
 * Prototype: @inquirer/core + file tree browser (hybrid)
 * SHERLO-464
 *
 * Usage: node prototype.mjs [startDir]
 *
 * Hybrid UI: text input at top + live file tree below.
 * - Type to filter the tree in real time
 * - Arrow keys navigate the tree
 * - Enter on folder drills in, Enter on file selects
 * - TAB autocompletes (folder = drill in, file = fill input)
 * - Esc goes to parent directory
 * - Only build files shown (.apk, .app, .tar.gz, .aab, .ipa) plus folders
 * - Emoji icons for file types
 */

import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  useMemo,
  useRef,
  isEnterKey,
  isUpKey,
  isDownKey,
  isBackspaceKey,
} from '@inquirer/core';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

// --- Config ---

const BUILD_EXTENSIONS = ['.apk', '.app', '.tar.gz', '.tar', '.aab', '.ipa'];
const MAX_VISIBLE = 12;

// --- Helpers ---

function isBuildFile(name) {
  const lower = name.toLowerCase();
  return BUILD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getIcon(entry) {
  if (entry.name === '..') return '\u2B06\uFE0F ';
  if (entry.isDir) return '\uD83D\uDCC1';

  const lower = entry.name.toLowerCase();
  if (lower.endsWith('.apk') || lower.endsWith('.aab')) return '\uD83E\uDD16';
  if (lower.endsWith('.app') || lower.endsWith('.ipa')) return '\uD83C\uDF4E';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tar')) return '\uD83D\uDCE6';
  return '\uD83D\uDCC4';
}

function readDir(dir) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const entries = [];

    // Parent nav
    const parent = path.dirname(dir);
    if (parent !== dir) {
      entries.push({ name: '..', isDir: true, fullPath: parent });
    }

    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        entries.push({ name: item.name, isDir: true, fullPath: full });
      } else if (isBuildFile(item.name)) {
        entries.push({ name: item.name, isDir: false, fullPath: full });
      }
    }

    // Sort: .. first, directories, files
    entries.sort((a, b) => {
      if (a.name === '..') return -1;
      if (b.name === '..') return 1;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  } catch {
    return [];
  }
}

// --- Custom Prompt ---

const fileBrowser = createPrompt((config, done) => {
  const startDir = config.startDir || process.cwd();
  const [currentDir, setCurrentDir] = useState(startDir);
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState('browsing');
  const resultRef = useRef('');

  // Read directory
  const allEntries = useMemo(() => readDir(currentDir), [currentDir]);

  // Filter by typed input
  const entries = useMemo(() => {
    if (!input) return allEntries;
    const lower = input.toLowerCase();
    return allEntries.filter(
      (e) => e.name === '..' || e.name.toLowerCase().includes(lower)
    );
  }, [allEntries, input]);

  // Clamp index
  const idx = Math.min(selectedIndex, Math.max(0, entries.length - 1));

  useKeypress((key, rl) => {
    if (status === 'done') return;

    if (isEnterKey(key)) {
      const entry = entries[idx];
      if (!entry) return;

      if (entry.isDir) {
        setCurrentDir(entry.fullPath);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      } else {
        resultRef.current = entry.fullPath;
        setStatus('done');
        done(entry.fullPath);
      }
      return;
    }

    if (isUpKey(key)) {
      setSelectedIndex(Math.max(0, idx - 1));
      return;
    }

    if (isDownKey(key)) {
      setSelectedIndex(Math.min(entries.length - 1, idx + 1));
      return;
    }

    if (key.name === 'tab') {
      const entry = entries[idx];
      if (!entry || entry.name === '..') return;

      if (entry.isDir) {
        setCurrentDir(entry.fullPath);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      } else {
        setInput(entry.name);
        rl.clearLine(0);
        rl.write(entry.name);
      }
      return;
    }

    if (key.name === 'escape') {
      const parent = path.dirname(currentDir);
      if (parent !== currentDir) {
        setCurrentDir(parent);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      }
      return;
    }

    // Regular typing / backspace - update filter from readline
    setInput(rl.line);
    setSelectedIndex(0);
  });

  // --- Render ---
  const prefix = usePrefix({ isLoading: false });

  if (status === 'done') {
    const rel = path.relative(startDir, resultRef.current);
    return `${prefix} ${config.message} ${chalk.cyan(rel)}`;
  }

  // Header (cursor stays on this line)
  const header = `${prefix} ${config.message} ${input}`;

  // Current directory indicator
  const relDir = path.relative(startDir, currentDir) || '.';
  const dirLine = chalk.dim(`  ${relDir}/`);

  // Tree lines with pagination
  const lines = [];

  if (entries.length === 0) {
    lines.push(chalk.dim('    (no matching files or folders)'));
  } else {
    let start = 0;
    if (entries.length > MAX_VISIBLE) {
      start = Math.max(
        0,
        Math.min(idx - Math.floor(MAX_VISIBLE / 2), entries.length - MAX_VISIBLE)
      );
    }
    const end = Math.min(start + MAX_VISIBLE, entries.length);

    if (start > 0) {
      lines.push(chalk.dim(`    ... ${start} more above`));
    }

    for (let i = start; i < end; i++) {
      const e = entries[i];
      const icon = getIcon(e);
      const name = e.isDir && e.name !== '..' ? e.name + '/' : e.name;

      if (i === idx) {
        lines.push(chalk.cyan(`  \u276F ${icon} ${name}`));
      } else {
        lines.push(`    ${icon} ${name}`);
      }
    }

    if (end < entries.length) {
      lines.push(chalk.dim(`    ... ${entries.length - end} more below`));
    }
  }

  // Hint
  const hint = chalk.dim(
    '  \u2191\u2193 navigate | Enter open/select | Tab autocomplete | Esc parent'
  );

  const bottom = [dirLine, ...lines, '', hint].join('\n');
  return [header, bottom];
});

// --- Main ---

const startDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'packages', 'cli', 'spike', 'test-builds');

console.log();
console.log(chalk.bold('Prototype: @inquirer/core + file tree browser (hybrid)'));
console.log(chalk.dim('SHERLO-464'));
console.log(
  chalk.dim(`Build files: ${BUILD_EXTENSIONS.join(', ')}`)
);
console.log();

try {
  const selected = await fileBrowser({
    message: 'Select build file:',
    startDir: fs.existsSync(startDir) ? startDir : process.cwd(),
  });

  console.log();
  console.log(`${chalk.green('\u2714')} Selected: ${chalk.cyan(selected)}`);
  console.log(`  Resolved: ${chalk.dim(path.resolve(selected))}`);
} catch (err) {
  if (err.name === 'ExitPromptError') {
    console.log();
    console.log(chalk.yellow('Cancelled.'));
  } else {
    throw err;
  }
}
