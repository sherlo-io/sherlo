/**
 * Spike: @inquirer/core + file tree browser (hybrid)
 * SHERLO-464
 *
 * Run: cd packages/cli/spike && npx tsx inquirer-file-tree.ts
 *
 * Hybrid UI: text input with TAB at top + live file tree below.
 * Arrow keys navigate tree, Enter on folder drills in, Enter on file selects.
 * Tree filters by input. Only build files shown (.apk, .app, .tar.gz)
 * plus folders and '..' for navigation. Emoji icons for folders/files.
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
import * as fs from 'fs';
import * as path from 'path';

// --- Config ---

const BUILD_EXTENSIONS = ['.apk', '.app', '.tar.gz', '.tar', '.aab', '.ipa'];
const MAX_VISIBLE_ENTRIES = 15;

// --- Types ---

interface FileEntry {
  name: string;
  isDirectory: boolean;
  fullPath: string;
}

interface FileBrowserConfig {
  message: string;
  startDir?: string;
}

// --- Helpers ---

function isBuildFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return BUILD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getIcon(entry: FileEntry): string {
  if (entry.name === '..') return '\u2B06\uFE0F ';
  if (entry.isDirectory) return '\uD83D\uDCC1';

  const lower = entry.name.toLowerCase();
  if (lower.endsWith('.apk') || lower.endsWith('.aab')) return '\uD83E\uDD16';
  if (lower.endsWith('.app') || lower.endsWith('.ipa')) return '\uD83C\uDF4E';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tar')) return '\uD83D\uDCE6';
  return '\uD83D\uDCC4';
}

function readDirEntries(dir: string): FileEntry[] {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const entries: FileEntry[] = [];

    // Parent directory
    const parent = path.dirname(dir);
    if (parent !== dir) {
      entries.push({ name: '..', isDirectory: true, fullPath: parent });
    }

    for (const item of items) {
      if (item.name.startsWith('.')) continue;

      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        entries.push({ name: item.name, isDirectory: true, fullPath });
      } else if (isBuildFile(item.name)) {
        entries.push({ name: item.name, isDirectory: false, fullPath });
      }
    }

    // Sort: '..' first, then directories, then files - alphabetical within each group
    entries.sort((a, b) => {
      if (a.name === '..') return -1;
      if (b.name === '..') return 1;
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  } catch {
    return [];
  }
}

function filterEntries(entries: FileEntry[], filter: string): FileEntry[] {
  if (!filter) return entries;
  const lower = filter.toLowerCase();
  return entries.filter(
    (e) => e.name === '..' || e.name.toLowerCase().includes(lower)
  );
}

// --- Prompt ---

const fileBrowser = createPrompt<string, FileBrowserConfig>((config, done) => {
  const startDir = config.startDir || process.cwd();
  const [currentDir, setCurrentDir] = useState(startDir);
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<'browsing' | 'done'>('browsing');
  const selectedValue = useRef('');

  // Read directory entries
  const allEntries = useMemo(() => readDirEntries(currentDir), [currentDir]);

  // Filter by typed input
  const entries = useMemo(
    () => filterEntries(allEntries, input),
    [allEntries, input]
  );

  // Clamp selected index
  const safeIndex = Math.min(selectedIndex, Math.max(0, entries.length - 1));

  useKeypress((key, rl) => {
    if (status === 'done') return;

    if (isEnterKey(key)) {
      const entry = entries[safeIndex];
      if (!entry) return;

      if (entry.isDirectory) {
        // Drill into directory
        setCurrentDir(entry.fullPath);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      } else {
        // File selected
        selectedValue.current = entry.fullPath;
        setStatus('done');
        done(entry.fullPath);
      }
    } else if (isUpKey(key)) {
      setSelectedIndex(Math.max(0, safeIndex - 1));
    } else if (isDownKey(key)) {
      setSelectedIndex(Math.min(entries.length - 1, safeIndex + 1));
    } else if (key.name === 'tab') {
      // TAB: autocomplete with selected entry
      const entry = entries[safeIndex];
      if (!entry || entry.name === '..') return;

      if (entry.isDirectory) {
        // Drill into selected directory
        setCurrentDir(entry.fullPath);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      } else {
        // Fill input with file name
        setInput(entry.name);
        rl.clearLine(0);
        rl.write(entry.name);
      }
    } else if (isBackspaceKey(key)) {
      setInput(rl.line);
      setSelectedIndex(0);
    } else if (key.name === 'escape') {
      // Go up one directory
      const parent = path.dirname(currentDir);
      if (parent !== currentDir) {
        setCurrentDir(parent);
        setInput('');
        setSelectedIndex(0);
        rl.clearLine(0);
        rl.write('');
      }
    } else {
      // Regular character input - update filter
      setInput(rl.line);
      setSelectedIndex(0);
    }
  });

  // --- Render ---
  const prefix = usePrefix({ isLoading: false });

  if (status === 'done') {
    const relPath = path.relative(startDir, selectedValue.current);
    return `${prefix} ${config.message} ${dim(relPath)}`;
  }

  // Header line (cursor stays here)
  const headerLine = `${prefix} ${config.message} ${input}`;

  // Directory indicator
  const relDir = path.relative(startDir, currentDir) || '.';
  const dirLine = dim(`  ${relDir}/`);

  // Tree entries
  const treeLines: string[] = [];

  if (entries.length === 0) {
    treeLines.push(dim('    (no matching files or folders)'));
  } else {
    // Pagination: keep selected item visible
    let startIdx = 0;
    if (entries.length > MAX_VISIBLE_ENTRIES) {
      startIdx = Math.max(
        0,
        Math.min(safeIndex - Math.floor(MAX_VISIBLE_ENTRIES / 2), entries.length - MAX_VISIBLE_ENTRIES)
      );
    }
    const endIdx = Math.min(startIdx + MAX_VISIBLE_ENTRIES, entries.length);

    if (startIdx > 0) {
      treeLines.push(dim(`    ... ${startIdx} more above`));
    }

    for (let i = startIdx; i < endIdx; i++) {
      const entry = entries[i];
      const icon = getIcon(entry);
      const displayName = entry.isDirectory && entry.name !== '..' ? entry.name + '/' : entry.name;
      const isSelected = i === safeIndex;

      if (isSelected) {
        treeLines.push(cyan(`  \u276F ${icon} ${displayName}`));
      } else {
        treeLines.push(`    ${icon} ${displayName}`);
      }
    }

    if (endIdx < entries.length) {
      treeLines.push(dim(`    ... ${entries.length - endIdx} more below`));
    }
  }

  // Hint line
  const hint = dim('  \u2191\u2193 navigate | Enter open/select | Tab autocomplete | Esc parent');

  const bottomContent = [dirLine, ...treeLines, '', hint].join('\n');
  return [headerLine, bottomContent];
});

// --- Minimal ANSI helpers (avoid chalk dependency) ---

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[39m`;
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[39m`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

// --- Main ---

async function main() {
  console.log(bold('\n\uD83D\uDD0D Spike: @inquirer/core + file tree browser (hybrid)\n'));
  console.log(dim('  SHERLO-464 - Prototype hybrid UI'));
  console.log(dim(`  Build extensions: ${BUILD_EXTENSIONS.join(', ')}\n`));

  const spikeDir = path.resolve(__dirname);
  const testBuildsDir = path.join(spikeDir, 'test-builds');
  const startDir = fs.existsSync(testBuildsDir) ? testBuildsDir : process.cwd();

  try {
    const selected = await fileBrowser({
      message: 'Select build file:',
      startDir,
    });

    console.log(green(`\n\u2705 Selected: ${selected}`));
    console.log(dim(`   Resolved: ${path.resolve(selected)}\n`));
  } catch (error: any) {
    if (error?.name === 'ExitPromptError') {
      console.log(dim('\n  Cancelled.\n'));
    } else {
      console.error('\nError:', error);
    }
  }
}

main();
