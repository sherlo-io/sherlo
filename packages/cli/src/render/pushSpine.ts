/**
 * THE PUSH SPINE'S LITERALS - the bytes of the transcript `sherlo test --android/--ios`
 * prints, and the one every other family's preamble is a subset of.
 *
 * Pure, like everything under ./: state in, print-call argument lists out. It is
 * split out of ./renderSegment only because the spine is the largest family in
 * the CLI and a single 400-line switch would stop being readable; renderSegment
 * still owns the dispatch, so there is exactly one entry point.
 *
 * WHAT IS DELIBERATE HERE AND MUST NOT BE TIDIED:
 *
 *   - A LEADING `\n` INSIDE A CHALK CALL IS NOT THE SAME BYTES AS A BLANK LINE.
 *     `chalk.cyan('\n📦 ...')` closes and reopens the style around the newline,
 *     so the preceding blank line is emitted as a STYLED empty line. Committed
 *     fixtures carry those bytes. Hoisting the `\n` out changes them and changes
 *     nothing a human sees - which is why it looks like a cleanup and is not one.
 *   - A TRAILING `\n` INSIDE A STRING IS CONTENT. `console.log('x\n')` prints two
 *     lines; the second is blank and a fixture compares it byte-for-byte.
 *   - TWO SPACES AFTER AN ICON align the text with the section titles above it.
 */
import chalk from 'chalk';
import { DEVICES } from '@sherlo/shared';
import { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../constants';
import type { Config } from '../types';

type PlatformDeviceCounts = { android: number; ios: number };

/**
 * How many devices of each platform a config asks for.
 *
 * Lives in the render layer because the COUNT is what gets rendered and nothing
 * upstream needs it: the run header's singular/plural, its per-platform
 * breakdown and its order are all decisions about what the line looks like.
 */
export function countDevicesByPlatform(configDevices: Config['devices']): PlatformDeviceCounts {
  const platformCounts: PlatformDeviceCounts = { android: 0, ios: 0 };

  configDevices.forEach((deviceConfig) => {
    const device = DEVICES[deviceConfig.id];

    if (device) platformCounts[device.os] += 1;
  });

  return platformCounts;
}

/** `Test 3 will run on 2 devices (1 Android, 1 iOS)` + a trailing blank line. */
export function renderRunHeader(nextBuildIndex: number, devices: Config['devices']): string {
  const platformCounts = countDevicesByPlatform(devices);
  const totalDevices = platformCounts.android + platformCounts.ios;
  const deviceText = totalDevices === 1 ? 'device' : 'devices';

  const platformBreakdown = [];
  if (platformCounts.android) {
    platformBreakdown.push(`${platformCounts.android} ${PLATFORM_LABEL.android}`);
  }
  if (platformCounts.ios) {
    platformBreakdown.push(`${platformCounts.ios} ${PLATFORM_LABEL.ios}`);
  }

  return `${chalk.green(`Test ${nextBuildIndex}`)} will run on ${chalk.blue(
    `${totalDevices} ${deviceText}`
  )} (${platformBreakdown.join(', ')})\n`;
}

/** `📦 Android` - the header of one platform's binary block. */
export function renderBinaryPlatformLabel(platform: Platform): string {
  return '📦 ' + chalk.bold(PLATFORM_LABEL[platform]);
}

/**
 * The `➜ ` / `✔ ` build line every binary block is made of.
 *
 * ONE implementation, used by the spine's own segments AND by the generic
 * `build-message` passthrough, so the icon and the two-space alignment cannot
 * drift between a fixtured call site and an unfixtured one.
 */
export function renderBuildMessageLine(message: string, type: 'info' | 'success'): string {
  const iconColor = type === 'success' ? 'green' : 'blue';
  const icon = type === 'success' ? '✔' : '➜';

  // Two spaces after the icon align the text with the section titles.
  return `${chalk[iconColor](icon)}  ${message}`;
}

/** `✔  reusing unchanged build (Test 1, 7 minutes ago)`. */
export function renderBinaryReused(buildIndex: number, timeAgo: string): string {
  return renderBuildMessageLine(
    `reusing unchanged build (${chalk.green(`Test ${buildIndex}`)}, ${chalk.blue(timeAgo)})`,
    'success'
  );
}

/** `WARNING: ...` / `INFO: ...`, with an optional `↳ Learn more:` line under it. */
export function renderNotice({
  level,
  message,
  learnMoreLink,
}: {
  level: 'warning' | 'info';
  message: string;
  learnMoreLink?: string;
}): string {
  const head =
    level === 'warning' ? chalk.yellow(`WARNING: ${message}`) : chalk.blue(`INFO: ${message}`);

  const lines = [head];

  if (learnMoreLink) {
    lines.push(chalk.dim(`↳ Learn more: ${formatLink(learnMoreLink)}`));
  }

  return lines.join('\n');
}

/** A link, underlined. Named for what it does - it has never printed anything. */
export function formatLink(link: string): string {
  return chalk.underline(link);
}

/**
 * The machine-readable `key=value` answer lines.
 *
 * A key with no value is NOT printed: an absent answer must read as absent,
 * never as an empty one. Values are newline-stripped so a multi-line reason can
 * never break the line format a parser depends on.
 */
export function renderOutputKeys(
  entries: Record<string, string | number | boolean | undefined>
): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === '') continue;

    lines.push(`${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  }

  return lines;
}
