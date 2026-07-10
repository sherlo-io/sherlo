/**
 * Output layer for staged:check (SHERLO-1692): renders the routing decision to
 * stdout (human text or --json), mirrors it to $GITHUB_OUTPUT, and exits with
 * the mode's contractual code.
 *
 * This is the ONLY place staged:check calls process.exit - every code path in
 * the command funnels through here so the three output forms (exit code, JSON,
 * GITHUB_OUTPUT) can never drift apart.
 */
import chalk from 'chalk';
import { GateDiffSource } from '@sherlo/api-types';
import { reporting, writeGithubOutput, type StagedMode } from '../../helpers';
import { EXIT_FAST, EXIT_FULL, EXIT_NOT_STAGEABLE } from './constants';

const EXIT_CODE: Record<StagedMode, number> = {
  fast: EXIT_FAST,
  full: EXIT_FULL,
  'not-stageable': EXIT_NOT_STAGEABLE,
};

const MODE_LABEL: Record<StagedMode, string> = {
  fast: '⚡ fast',
  full: '🔨 full',
  'not-stageable': '🚫 not-stageable',
};

/** Per-platform detail carried in the --json payload (never printed as text). */
export type PlatformDecision = {
  platform: 'android' | 'ios';
  mode: StagedMode;
  reason: string;
  diff: GateDiffSource[];
};

export type StagedCheckPayload = {
  mode: StagedMode;
  reason: string;
  baseFingerprint: string | null;
  platforms: PlatformDecision[];
};

/**
 * Print the result (human text or --json), write GITHUB_OUTPUT, flush
 * telemetry, then exit with the mode's contractual code. Never returns.
 */
async function reportAndExit({
  jsonOutput,
  mode,
  reason,
  baseFingerprint,
  platforms,
}: StagedCheckPayload & { jsonOutput: boolean }): Promise<never> {
  if (jsonOutput) {
    console.log(
      JSON.stringify({ mode, reason, baseFingerprint, platforms } satisfies StagedCheckPayload)
    );
  } else {
    console.log(`\n${MODE_LABEL[mode]} ${chalk.bold(`mode=${mode}`)}`);
    if (reason) console.log(chalk.dim(reason));
    if (baseFingerprint) console.log(chalk.dim(`baseFingerprint: ${baseFingerprint}`));
  }

  writeGithubOutput({
    mode,
    reason,
    ...(baseFingerprint ? { baseFingerprint } : {}),
  });

  await reporting.flush().finally(() => {
    process.exit(EXIT_CODE[mode]);
  });

  // Unreachable - process.exit above never returns. Satisfies the `never`
  // return type when process.exit is stubbed in tests.
  throw new Error('unreachable');
}

export default reportAndExit;
