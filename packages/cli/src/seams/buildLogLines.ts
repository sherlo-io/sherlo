import fs from 'fs';

/** How many of a failed build's last lines the run shows. */
const LAST_LINES_SHOWN = 30;

/** A compiler diagnostic ("File.m:12:5: error: ", "File.h:3:10: fatal error: " or "File.java:117: error: "), never a selector like "error:(NSError". */
const COMPILER_DIAGNOSTIC = /:\d+(?::\d+)?: (?:fatal )?error: /;

/** A line that starts with "error:" or "ERROR:" (any case) or "<tool>: error: " such as "clang: error: ", after optional spaces or a cross mark. */
const ERROR_PREFIX = /^\s*(?:❌\s*)?(?:error:|[\w.+-]+: (?:fatal )?error: )/i;

/** The lines a failed build's log shows (errors first, then the last lines), from `fromByte` on. */
export function lastLinesOf(logPath: string, fromByte = 0): string[] {
  if (!fs.existsSync(logPath)) return [];
  const log = fs.readFileSync(logPath).subarray(fromByte);
  return buildLogLinesShown(log.toString('utf8'), LAST_LINES_SHOWN);
}

/**
 * The lines a failed build shows: the log's distinct error lines first, in log order (a compiler
 * diagnostic, a line that starts with "error:", Gradle's "* What went wrong:" block up to the next
 * "* " heading, a "FAILED" task line, "** BUILD FAILED **" with the lines under it), then the last
 * lines, together no more than `limit`. A log with no error line shows its last lines.
 */
export function buildLogLinesShown(logText: string, limit: number): string[] {
  const lines = logText.trimEnd().split('\n');
  const errorLines: string[] = [];
  const errorIndexes: number[] = [];
  let inWhatWentWrong = false;
  let afterBuildFailed = false;
  lines.forEach((line, index) => {
    if (line.startsWith('* ')) inWhatWentWrong = line.startsWith('* What went wrong:');
    if (line.startsWith('** BUILD FAILED **')) afterBuildFailed = true;
    const isErrorLine =
      inWhatWentWrong ||
      afterBuildFailed ||
      COMPILER_DIAGNOSTIC.test(line) ||
      ERROR_PREFIX.test(line) ||
      /\bFAILED$/.test(line);
    if (!isErrorLine || errorLines.includes(line)) return;
    errorLines.push(line);
    errorIndexes.push(index);
  });
  if (errorIndexes.length === 0) return lines.slice(-limit);

  const shownErrors = errorIndexes.slice(0, limit);
  const tailStart = Math.max(0, lines.length - (limit - shownErrors.length));
  const tailLines: string[] = [];
  for (let index = tailStart; index < lines.length; index += 1) {
    if (!shownErrors.includes(index) && !errorLines.includes(lines[index])) {
      tailLines.push(lines[index]);
    }
  }
  return [...shownErrors.map((index) => lines[index]), ...tailLines];
}
