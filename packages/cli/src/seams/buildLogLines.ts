import fs from 'fs';

/** How many of a failed build's last lines the run shows. */
const LAST_LINES_SHOWN = 30;

/** The lines a failed build's log shows (errors first, then the last lines), from `fromByte` on. */
export function lastLinesOf(logPath: string, fromByte = 0): string[] {
  if (!fs.existsSync(logPath)) return [];
  const log = fs.readFileSync(logPath).subarray(fromByte);
  return buildLogLinesShown(log.toString('utf8'), LAST_LINES_SHOWN);
}

/**
 * The lines a failed build shows: the log's error lines first (a line with "error:", Gradle's
 * "* What went wrong:" block up to the next "* " heading, a "FAILED" task line), then the last
 * lines, together no more than `limit`. A log with no error line shows its last lines.
 */
export function buildLogLinesShown(logText: string, limit: number): string[] {
  const lines = logText.trimEnd().split('\n');
  const errorIndexes: number[] = [];
  let inWhatWentWrong = false;
  lines.forEach((line, index) => {
    if (line.startsWith('* ')) inWhatWentWrong = line.startsWith('* What went wrong:');
    const isErrorLine = inWhatWentWrong || line.includes('error:') || /\bFAILED$/.test(line);
    if (isErrorLine) errorIndexes.push(index);
  });
  if (errorIndexes.length === 0) return lines.slice(-limit);

  const shownErrors = errorIndexes.slice(0, limit);
  const tailStart = Math.max(0, lines.length - (limit - shownErrors.length));
  const tailIndexes: number[] = [];
  for (let index = tailStart; index < lines.length; index += 1) {
    if (!shownErrors.includes(index)) tailIndexes.push(index);
  }
  return [...shownErrors, ...tailIndexes].map((index) => lines[index]);
}
