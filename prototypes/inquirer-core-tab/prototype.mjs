/**
 * Prototype: @inquirer/core custom prompt with TAB file path autocomplete
 * SHERLO-463
 *
 * Usage: node prototype.mjs
 *
 * Features:
 * - TAB completes file paths (single match = full complete, multiple = common prefix)
 * - Shows matching candidates below the prompt when multiple matches exist
 * - Visual style matches Sherlo CLI (green ? prefix, cyan answer)
 */

import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  isTabKey,
  makeTheme,
} from '@inquirer/core';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

// --- File completion logic ---

function getCompletions(input) {
  if (!input) return { completed: '', candidates: [] };

  const resolved = path.resolve(input);
  const dir = input.endsWith('/') ? resolved : path.dirname(resolved);
  const prefix = input.endsWith('/') ? '' : path.basename(resolved);

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { completed: input, candidates: [] };
  }

  const matches = entries.filter((e) => e.name.startsWith(prefix));

  if (matches.length === 0) {
    return { completed: input, candidates: [] };
  }

  if (matches.length === 1) {
    const match = matches[0];
    const full = path.join(dir, match.name);
    // Append / for directories so user can keep tabbing deeper
    const result = match.isDirectory() ? full + '/' : full;
    // Return path relative to cwd if the original input was relative
    return {
      completed: path.isAbsolute(input) ? result : toRelative(result),
      candidates: [],
    };
  }

  // Multiple matches - complete to longest common prefix
  const common = longestCommonPrefix(matches.map((m) => m.name));
  const candidateNames = matches.map((m) => (m.isDirectory() ? m.name + '/' : m.name));

  // If common prefix extends beyond what user typed, complete to it
  // Otherwise keep input as-is (just show candidates)
  let completed;
  if (common.length > prefix.length) {
    const completedPath = path.join(dir, common);
    completed = path.isAbsolute(input) ? completedPath : toRelative(completedPath);
  } else {
    completed = input;
  }

  return { completed, candidates: candidateNames };
}

function longestCommonPrefix(strings) {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

function toRelative(absolutePath) {
  const rel = path.relative(process.cwd(), absolutePath);
  // Empty relative means it's the cwd itself - use './'
  if (!rel) return './';
  // Preserve trailing slash for directories
  if (absolutePath.endsWith('/') && !rel.endsWith('/')) {
    return rel + '/';
  }
  return rel;
}

// --- Custom prompt ---

const filePathInput = createPrompt((config, done) => {
  const theme = makeTheme(config.theme);
  const [status, setStatus] = useState('idle');
  const [value, setValue] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState();
  const prefix = usePrefix({ status, theme });

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;

    if (isEnterKey(key)) {
      const answer = value;
      if (!answer) {
        setError('Path is required');
        return;
      }

      // Run validation if provided
      if (typeof config.validate === 'function') {
        const result = await config.validate(answer);
        if (result !== true) {
          setError(typeof result === 'string' ? result : 'Invalid path');
          return;
        }
      }

      setStatus('done');
      setCandidates([]);
      done(answer);
    } else if (isTabKey(key)) {
      // Clear the tab character that was inserted
      rl.clearLine(0);

      const current = value;
      const { completed, candidates: newCandidates } = getCompletions(current);

      rl.write(completed);
      setValue(completed);
      setCandidates(newCandidates);
      setError(undefined);
    } else {
      setValue(rl.line);
      setCandidates([]);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);

  let formattedValue = value;
  if (status === 'done') {
    formattedValue = theme.style.answer(value);
  }

  // Build the prompt line
  const promptLine = `${prefix} ${message} ${formattedValue}`;

  // Build the bottom content (candidates + error)
  const bottomParts = [];

  if (candidates.length > 0) {
    bottomParts.push(chalk.dim('  Matches: ') + candidates.map((c) => chalk.cyan(c)).join('  '));
  }

  if (error) {
    bottomParts.push(theme.style.error(error));
  }

  return [promptLine, bottomParts.join('\n') || undefined];
});

// --- Run the prototype ---

console.log();
console.log(chalk.bold('Prototype: @inquirer/core + TAB path autocomplete'));
console.log(chalk.dim('Press TAB to autocomplete file paths. Press Enter to submit.'));
console.log();

try {
  const result = await filePathInput({
    message: 'Enter path to iOS build (.app, .tar.gz):',
    validate: (value) => {
      const resolved = path.resolve(value);
      try {
        fs.statSync(resolved);
        return true;
      } catch {
        return `File does not exist at "${value}" ${chalk.dim(`(${resolved})`)}`;
      }
    },
  });

  console.log();
  console.log(`${chalk.green('✔')} Selected: ${chalk.cyan(result)}`);
  console.log(`  Resolved: ${chalk.dim(path.resolve(result))}`);
} catch (err) {
  if (err.name === 'ExitPromptError') {
    console.log();
    console.log(chalk.yellow('Cancelled.'));
  } else {
    throw err;
  }
}
