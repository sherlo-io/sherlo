import {
  createPrompt,
  useState,
  useKeypress,
  useEffect,
  useMemo,
  isEnterKey,
  isUpKey,
  isDownKey,
  isTabKey,
} from '@inquirer/core';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

interface FileBrowserConfig {
  message: string;
  /** File extensions to show (e.g. ['.apk', '.app', '.tar.gz']). Empty = show all files */
  extensions?: string[];
  /** Page size for the tree view. Default 10 */
  pageSize?: number;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  fullPath: string;
  isParent: boolean;
}

const ICONS = {
  folder: '\u{1F4C1}',
  apple: '\u{1F34E}',
  android: '\u{1F916}',
  file: '\u{1F4C4}',
  pointer: '\u276F',
} as const;

function getIcon(entry: FileEntry): string {
  if (entry.isDirectory) return ICONS.folder;
  const name = entry.name.toLowerCase();
  if (name.endsWith('.apk')) return ICONS.android;
  if (name.endsWith('.app') || name.endsWith('.tar.gz') || name.endsWith('.tar')) return ICONS.apple;
  return ICONS.file;
}

function matchesExtensions(name: string, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return extensions.includes('.tar.gz');
  return extensions.some((ext) => lower.endsWith(ext));
}

function readDir(dirPath: string, extensions: string[]): FileEntry[] {
  try {
    const names = fs.readdirSync(dirPath);
    const entries: FileEntry[] = [];

    for (const name of names) {
      if (name === '.' || name === '..') continue;

      const fullPath = path.join(dirPath, name);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory() || matchesExtensions(name, extensions)) {
        entries.push({ name, isDirectory: stats.isDirectory(), fullPath, isParent: false });
      }
    }

    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  } catch {
    return [];
  }
}

function countHiddenFiles(dirPath: string, extensions: string[]): number {
  if (extensions.length === 0) return 0;
  try {
    const names = fs.readdirSync(dirPath);
    let count = 0;
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      try {
        const fullPath = path.join(dirPath, name);
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory() && !matchesExtensions(name, extensions)) {
          count++;
        }
      } catch {
        continue;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function parsePath(inputPath: string, cwd: string): { dirPath: string; filter: string } {
  if (!inputPath) {
    return { dirPath: cwd, filter: '' };
  }

  if (inputPath.endsWith('/') || inputPath.endsWith(path.sep)) {
    return { dirPath: path.resolve(cwd, inputPath), filter: '' };
  }

  const lastSlash = inputPath.lastIndexOf('/');
  if (lastSlash === -1) {
    return { dirPath: cwd, filter: inputPath };
  }

  const dirPortion = inputPath.slice(0, lastSlash + 1);
  const filterPortion = inputPath.slice(lastSlash + 1);
  return { dirPath: path.resolve(cwd, dirPortion), filter: filterPortion };
}

/** Directly set readline content and cursor position (avoids append behavior of rl.write) */
function setReadline(rl: { line: string }, value: string): void {
  rl.line = value;
  (rl as any).cursor = value.length;
}

const fileBrowserPrompt = createPrompt<string, FileBrowserConfig>((config, done) => {
  const extensions = config.extensions ?? [];
  const pageSize = config.pageSize ?? 10;
  const cwd = process.cwd();

  const [pathInput, setPathInput] = useState('');
  const [active, setActive] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [status, setStatus] = useState<'idle' | 'done'>('idle');

  useEffect((rl) => {
    rl.write('./');
    setPathInput('./');
  }, []);

  const isAbsolute = pathInput.startsWith('/');

  const { dirPath, filter } = useMemo(() => parsePath(pathInput, cwd), [pathInput, cwd]);

  const dirExists = useMemo(() => {
    try {
      return fs.statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }, [dirPath]);

  const entries = useMemo(() => {
    if (!dirExists) return [];

    const items = readDir(dirPath, extensions);

    const parent: FileEntry = {
      name: '..',
      isDirectory: true,
      fullPath: path.dirname(dirPath),
      isParent: true,
    };
    const all = [parent, ...items];

    if (!filter) return all;

    const lower = filter.toLowerCase();
    return all.filter((e) => e.isParent || e.name.toLowerCase().startsWith(lower));
  }, [dirPath, dirExists, extensions, filter]);

  const hiddenCount = useMemo(
    () => countHiddenFiles(dirPath, extensions),
    [dirPath, extensions]
  );

  const resolvedActive = useMemo(
    () => Math.max(0, Math.min(active, entries.length - 1)),
    [active, entries]
  );

  useKeypress((key, rl) => {
    if (status === 'done') return;

    if (isUpKey(key)) {
      setReadline(rl, pathInput);
      const next = resolvedActive > 0 ? resolvedActive - 1 : entries.length - 1;
      setActive(next);
      const dist = (next - scrollOffset + entries.length) % entries.length;
      if (dist >= pageSize) setScrollOffset((scrollOffset - 1 + entries.length) % entries.length);
      return;
    }

    if (isDownKey(key)) {
      setReadline(rl, pathInput);
      const next = resolvedActive < entries.length - 1 ? resolvedActive + 1 : 0;
      setActive(next);
      const dist = (next - scrollOffset + entries.length) % entries.length;
      if (dist >= pageSize) setScrollOffset((scrollOffset + 1) % entries.length);
      return;
    }

    if (isEnterKey(key)) {
      const entry = entries[resolvedActive];
      if (!entry) return;

      // Ignore .. at filesystem root
      if (entry.isParent && path.dirname(dirPath) === dirPath) return;

      if (entry.isDirectory) {
        const newPath = toDisplayPath(entry.fullPath, cwd, isAbsolute) + '/';
        setReadline(rl, newPath);
        setPathInput(newPath);
        setScrollOffset(0);
        setActive(entry.isParent ? 0 : 1);
      } else {
        const displayPath = toDisplayPath(entry.fullPath, cwd, isAbsolute);
        setStatus('done');
        done(displayPath);
      }
      return;
    }

    if (isTabKey(key)) {
      const nonParent = entries.filter((e) => !e.isParent);
      if (nonParent.length === 1) {
        const entry = nonParent[0]!;
        const display = toDisplayPath(entry.fullPath, cwd, isAbsolute);
        if (entry.isDirectory) {
          const newPath = display + '/';
          setReadline(rl, newPath);
          setPathInput(newPath);
          setScrollOffset(0);
          setActive(1);
        } else {
          setReadline(rl, display);
          setPathInput(display);
          const idx = entries.indexOf(entry);
          if (idx >= 0) setActive(idx);
        }
      } else if (nonParent.length > 1) {
        const names = nonParent.map((e) => e.name);
        const prefix = commonPrefix(names);
        if (prefix.length > filter.length) {
          const dirDisplay = toDisplayPath(dirPath, cwd, isAbsolute);
          const sep = dirDisplay.endsWith('/') ? '' : '/';
          const newPath = dirDisplay + sep + prefix;
          setReadline(rl, newPath);
          setPathInput(newPath);
        } else {
          setReadline(rl, pathInput);
        }
      } else {
        setReadline(rl, pathInput);
      }
      return;
    }

    if (key.name === 'escape') {
      setStatus('done');
      done('');
      return;
    }

    if (rl.line === './/') {
      setReadline(rl, '/');
      setPathInput('/');
      setScrollOffset(0);
      setActive(1);
      return;
    }

    setPathInput(rl.line);
    setScrollOffset(0);
    setActive(1);
  });

  if (status === 'done') {
    const selected = entries[resolvedActive];
    const displayPath = selected ? toDisplayPath(selected.fullPath, cwd, isAbsolute) : '';
    return `${chalk.green('?')} ${chalk.bold(config.message)} ${chalk.cyan(displayPath)}`;
  }

  // Render the tree with circular pagination
  let tree: string;
  if (entries.length === 0) {
    tree = chalk.dim('  (no matching entries)');
  } else {
    const count = Math.min(pageSize, entries.length);
    const rows: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = (scrollOffset + i) % entries.length;
      const item = entries[idx]!;
      const isActive = idx === resolvedActive;
      const icon = getIcon(item);
      const displayName = item.isDirectory ? `${item.name}/` : item.name;

      const isRootParent = item.isParent && path.dirname(dirPath) === dirPath;
      if (isRootParent) {
        const cursor = isActive ? chalk.dim(ICONS.pointer) : ' ';
        rows.push(`${cursor} ${icon} ${chalk.dim(displayName)}`);
      } else {
        const cursor = isActive ? chalk.cyan(ICONS.pointer) : ' ';
        const name = isActive
          ? chalk.cyan(displayName)
          : item.isDirectory
            ? chalk.bold(displayName)
            : displayName;
        rows.push(`${cursor} ${icon} ${name}`);
      }
    }
    tree = rows.join('\n');
  }

  const lines = [
    `${chalk.blue('?')} ${chalk.bold(config.message)} ${chalk.yellow(pathInput || './')}`,
    tree,
  ];

  if (hiddenCount > 0) {
    lines.push(
      chalk.dim(`  (+ ${hiddenCount} hidden ${hiddenCount === 1 ? 'file' : 'files'})`)
    );
  }

  lines.push('');
  lines.push(chalk.dim('  \u2191\u2193 navigate  \u21B5 select/open  tab complete  esc cancel'));

  return lines.join('\n');
});

/** Convert an absolute fullPath to either absolute or relative display, matching user's style */
function toDisplayPath(fullPath: string, cwd: string, absolute: boolean): string {
  if (absolute) return fullPath;
  const rel = path.relative(cwd, fullPath);
  return rel || '.';
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  const lower = strings.map((s) => s.toLowerCase());
  let len = lower[0]!.length;
  for (let i = 1; i < lower.length; i++) {
    while (len > 0 && !lower[i]!.startsWith(lower[0]!.slice(0, len))) {
      len--;
    }
    if (len === 0) return '';
  }
  return lower[0]!.slice(0, len);
}

export default fileBrowserPrompt;
export type { FileBrowserConfig };
