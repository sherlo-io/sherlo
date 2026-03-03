/**
 * SPIKE: Shell delegation approach for file path input with TAB completion
 *
 * Approach: Spawn a bash subshell with `read -e` which enables readline
 * with native TAB completion for file paths. The user types in bash's
 * readline environment, and we capture the result back in Node.js.
 *
 * Pros:
 * - Native OS-level TAB completion (bash's built-in)
 * - No npm dependencies needed
 * - Works with all file systems bash supports
 *
 * Cons:
 * - Requires bash (not available on all Windows setups)
 * - Limited control over UI/styling
 * - Harder to add custom validation inline
 * - macOS ships bash 3.2 which lacks `read -i` (initial text) - requires bash 4+
 *
 * FINDING: `read -i` (pre-fill input) is NOT available on macOS default bash 3.2
 * Only `read -e` (readline) and `read -p` (prompt) are portable across bash 3.2+
 */

import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ─── Helpers ────────────────────────────────────────────────────────

function getBashVersion(): { major: number; minor: number } | null {
  try {
    const output = execSync('bash -c \'echo "${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}"\'', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const [major, minor] = output.trim().split('.').map(Number);
    return { major, minor };
  } catch {
    return null;
  }
}

function supportsReadI(): boolean {
  const version = getBashVersion();
  return version !== null && version.major >= 4;
}

// ─── Approach 1: Simple read -e (bash 3.2+ compatible) ──────────────

function promptPathSimple(prompt: string): string | null {
  try {
    // read -e enables readline with TAB completion
    // -p sets the prompt string
    const result = spawnSync(
      'bash',
      ['-c', `read -e -p "${prompt}" path && echo "$path"`],
      {
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf-8',
      }
    );
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

// ─── Approach 2: With initial directory hint (bash 4+ only) ─────────

function promptPathWithDir(prompt: string, startDir?: string): string | null {
  // -i flag requires bash 4+, fall back to simple prompt on older bash
  if (!supportsReadI() || !startDir) {
    console.log('  (Note: -i flag unavailable on this bash version, falling back to simple prompt)');
    return promptPathSimple(prompt);
  }

  const result = spawnSync(
    'bash',
    ['-c', `read -e -p "${prompt}" -i "${startDir}/" path && echo "$path"`],
    {
      stdio: ['inherit', 'pipe', 'inherit'],
      encoding: 'utf-8',
    }
  );

  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

// ─── Approach 3: Custom completion with extension filter (bash 4+) ──

function promptPathFiltered(
  prompt: string,
  allowedExtensions: string[],
  startDir?: string
): string | null {
  // Custom completion requires programmable completion (bash 4+)
  if (!supportsReadI()) {
    console.log('  (Note: custom completion unavailable on bash 3.2, falling back to simple prompt)');
    return promptPathSimple(prompt);
  }

  const extPattern = allowedExtensions.map((e) => `*${e}`).join('|');
  const initArg = startDir ? `-i "${startDir}/"` : '';

  // Write script to a temp approach to avoid quoting issues
  const script = [
    'shopt -s extglob',
    '_filter_complete() {',
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  COMPREPLY=()',
    '  while IFS= read -r file; do',
    '    [ -z "$file" ] && continue',
    '    if [ -d "$file" ]; then',
    '      COMPREPLY+=("$file/")',
    `    elif [[ "$file" == @(${extPattern}) ]]; then`,
    '      COMPREPLY+=("$file")',
    '    fi',
    '  done < <(compgen -f -- "$cur" 2>/dev/null)',
    '}',
    'complete -F _filter_complete -o nospace read',
    `read -e -p "${prompt}" ${initArg} path`,
    'echo "$path"',
  ].join('\n');

  const result = spawnSync('bash', ['-c', script], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf-8',
  });

  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

// ─── Approach 4: With validation loop (bash 3.2+ compatible) ────────

function promptPathValidated(
  prompt: string,
  options: {
    allowedExtensions?: string[];
    mustExist?: boolean;
  } = {}
): string | null {
  const { allowedExtensions, mustExist = true } = options;

  while (true) {
    const result = spawnSync(
      'bash',
      ['-c', `read -e -p "${prompt}" path && echo "$path"`],
      {
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf-8',
      }
    );

    if (result.status !== 0) return null;

    const rawPath = result.stdout.trim();
    if (!rawPath) {
      console.log('  No path entered. Try again or press Ctrl+C to cancel.');
      continue;
    }

    const resolved = path.resolve(rawPath);

    if (mustExist && !fs.existsSync(resolved)) {
      console.log(`  File not found: ${resolved}`);
      console.log('  Try again or press Ctrl+C to cancel.\n');
      continue;
    }

    if (allowedExtensions && allowedExtensions.length > 0) {
      const ext = allowedExtensions.find((e) => resolved.endsWith(e));
      if (!ext) {
        console.log(
          `  Invalid extension. Allowed: ${allowedExtensions.join(', ')}`
        );
        console.log('  Try again or press Ctrl+C to cancel.\n');
        continue;
      }
    }

    return resolved;
  }
}

// ─── Demo ───────────────────────────────────────────────────────────

async function main() {
  console.log('=== SPIKE: Shell Delegation (bash read -e) ===\n');
  console.log('This prototype tests native TAB completion via bash subprocess.\n');

  // Environment info
  const version = getBashVersion();
  console.log(`Bash version: ${version ? `${version.major}.${version.minor}` : 'unknown'}`);
  console.log(`Supports read -i: ${supportsReadI() ? 'yes' : 'NO (requires bash 4+)'}`);
  console.log(`Platform: ${process.platform}\n`);

  // Test 1: Simple prompt (bash 3.2+ compatible)
  console.log('--- Test 1: Simple read -e (portable) ---');
  console.log('Type a file path (use TAB for completion):\n');
  const path1 = promptPathSimple('  Enter file path: ');
  console.log(`\n  Result: ${path1}\n`);

  // Test 2: With starting directory (bash 4+ only)
  console.log('--- Test 2: With starting directory (bash 4+ only) ---');
  console.log('Path is pre-filled with current directory:\n');
  const path2 = promptPathWithDir('  Enter file path: ', '.');
  console.log(`\n  Result: ${path2}\n`);

  // Test 3: With extension filter (bash 4+ only)
  console.log('--- Test 3: Extension filter (bash 4+ only) ---');
  console.log('TAB completion only shows .ts and .json files:\n');
  const path3 = promptPathFiltered('  Enter .ts/.json file: ', ['.ts', '.json']);
  console.log(`\n  Result: ${path3}\n`);

  // Test 4: With validation loop (bash 3.2+ compatible)
  console.log('--- Test 4: Validation loop (portable) ---');
  console.log('Only existing .ts and .js files accepted:\n');
  const path4 = promptPathValidated('  Enter .ts/.js file: ', {
    allowedExtensions: ['.ts', '.js'],
    mustExist: true,
  });
  console.log(`\n  Result: ${path4}\n`);

  console.log('=== Spike complete ===');
}

main().catch(console.error);
