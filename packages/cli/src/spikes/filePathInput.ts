import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  isTabKey,
  makeTheme,
  type Theme,
  type Status,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

type FilePathInputConfig = {
  message: string;
  default?: string;
  required?: boolean;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
  theme?: PartialDeep<Theme>;
};

function getCompletions(partial: string): string[] {
  if (!partial || partial.trim() === '') {
    // Empty input - show current directory contents
    try {
      const cwd = process.cwd();
      const entries = fs.readdirSync(cwd);
      return entries.map(e => {
        const fullPath = path.join(cwd, e);
        const isDir = fs.statSync(fullPath).isDirectory();
        return e + (isDir ? '/' : '');
      });
    } catch {
      return [];
    }
  }

  // Resolve tilde to home directory
  let resolvedPartial = partial;
  if (partial === '~') {
    resolvedPartial = (process.env.HOME || process.env.USERPROFILE || '') + '/';
  } else if (partial.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    resolvedPartial = home + partial.slice(1);
  }

  // Check after tilde expansion (path.join/resolve strips trailing slashes)
  const endsWithSlash = resolvedPartial.endsWith('/') || resolvedPartial.endsWith(path.sep);

  const resolved = path.isAbsolute(resolvedPartial)
    ? resolvedPartial
    : path.resolve(process.cwd(), resolvedPartial);

  const dir = endsWithSlash ? resolved : path.dirname(resolved);
  const prefix = endsWithSlash ? '' : path.basename(resolved);

  try {
    const entries = fs.readdirSync(dir);
    const matches = entries.filter(e => e.startsWith(prefix));

    return matches.map(m => {
      const fullPath = path.join(dir, m);
      let isDir = false;
      try {
        isDir = fs.statSync(fullPath).isDirectory();
      } catch {
        isDir = false;
      }

      const basePath = endsWithSlash ? resolvedPartial : path.dirname(resolvedPartial);
      let result = path.join(basePath, m);

      // Convert back to tilde notation if original used it
      if (partial.startsWith('~/')) {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        if (result.startsWith(home)) {
          result = '~' + result.slice(home.length);
        }
      }

      return result + (isDir ? '/' : '');
    });
  } catch {
    return [];
  }
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix === '') break;
  }
  return prefix;
}

function formatCompletionsList(completions: string[], maxWidth: number = 80): string {
  if (completions.length === 0) return '';

  // Format each entry with colors
  const formatted = completions.map(c => {
    const isDir = c.endsWith('/');
    const name = path.basename(c);
    return isDir ? chalk.blue(name) : name;
  });

  // If few entries, show as simple list
  if (completions.length <= 10) {
    return formatted.join('  ');
  }

  // For many entries, try to show in columns
  const maxEntryLength = Math.max(...formatted.map(e => e.length));
  const columnWidth = maxEntryLength + 2;
  const numColumns = Math.max(1, Math.floor(maxWidth / columnWidth));
  const numRows = Math.ceil(formatted.length / numColumns);

  const rows: string[] = [];
  for (let row = 0; row < numRows; row++) {
    const rowEntries: string[] = [];
    for (let col = 0; col < numColumns; col++) {
      const index = row + col * numRows;
      if (index < formatted.length) {
        rowEntries.push(formatted[index].padEnd(columnWidth));
      }
    }
    if (rowEntries.length > 0) {
      rows.push(rowEntries.join(''));
    }
  }

  return rows.join('\n');
}

export default createPrompt<string, FilePathInputConfig>((config, done) => {
  const { message, default: defaultValue = '', validate } = config;
  const theme = makeTheme({}, config.theme);
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState<string>(defaultValue);
  const [errorMsg, setError] = useState<string | undefined>();
  const [completions, setCompletions] = useState<string[]>([]);
  const [showCompletions, setShowCompletions] = useState(false);
  const prefix = usePrefix({ status, theme });

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;

    if (isEnterKey(key)) {
      const answer = value || defaultValue;
      setStatus('loading');

      // Run validation if provided
      if (validate) {
        const isValid = await validate(answer);
        if (isValid === true) {
          setError(undefined);
          setStatus('done');
          done(answer);
        } else {
          const errorMessage = typeof isValid === 'string' ? isValid : 'Invalid input';
          setError(errorMessage);
          setStatus('idle');
        }
      } else {
        setStatus('done');
        done(answer);
      }
    } else if (isTabKey(key)) {
      // Handle TAB key for autocomplete
      const currentValue = rl.line;
      const matches = getCompletions(currentValue);

      if (matches.length === 0) {
        // No matches - do nothing
        setShowCompletions(false);
      } else if (matches.length === 1) {
        // Single match - complete it
        const completed = matches[0];
        rl.clearLine(0);
        rl.write(completed);
        setValue(completed);
        setShowCompletions(false);
        setCompletions([]);
      } else {
        // Multiple matches - complete to common prefix and show list
        const commonPrefix = longestCommonPrefix(matches);
        if (commonPrefix && commonPrefix.length > currentValue.length) {
          rl.clearLine(0);
          rl.write(commonPrefix);
          setValue(commonPrefix);
        }
        setCompletions(matches);
        setShowCompletions(true);
      }
    } else {
      // Any other key - update value and hide completions
      setValue(rl.line);
      setError(undefined);
      setShowCompletions(false);
      setCompletions([]);
    }
  });

  const formattedMessage = theme.style.message(message, status);

  let formattedValue = value;
  if (status === 'done') {
    formattedValue = theme.style.answer(value);
  }

  let defaultStr: string | undefined;
  if (defaultValue && status !== 'done' && !value) {
    defaultStr = theme.style.defaultAnswer(defaultValue);
  }

  let error = '';
  if (errorMsg) {
    error = theme.style.error(errorMsg);
  }

  let completionsStr = '';
  if (showCompletions && completions.length > 0) {
    completionsStr = formatCompletionsList(completions);
  }

  const mainLine = [prefix, formattedMessage, defaultStr, formattedValue]
    .filter((v) => v !== undefined)
    .join(' ');

  const bottomLines = [error, completionsStr].filter(Boolean).join('\n');

  return [mainLine, bottomLines];
});
