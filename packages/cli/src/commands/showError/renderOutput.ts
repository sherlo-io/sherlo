import chalk from 'chalk';
import { JsErrorJson, ParsedFrame } from './types';

function renderFrame(frame: ParsedFrame): string {
  if (frame.file === null || frame.line === null) {
    return `  at ${frame.fnName} ${chalk.dim('(<anonymous>)')}`;
  }
  const isTTY = process.stdout.isTTY;
  if (isTTY) {
    const loc = frame.col !== null
      ? `${chalk.cyan(frame.file)}${chalk.dim(`:${frame.line}:${frame.col}`)}`
      : `${chalk.cyan(frame.file)}${chalk.dim(`:${frame.line}`)}`;
    return `  at ${frame.fnName} (${loc})`;
  }
  if (frame.col !== null) {
    return `  at ${frame.fnName} (${frame.file}:${frame.line}:${frame.col})`;
  }
  return `  at ${frame.fnName} (${frame.file}:${frame.line})`;
}

function renderOutput(data: JsErrorJson): string {
  const lines: string[] = [];

  // componentStack is not printed: production builds have mostly <anonymous> frames that can't
  // symbolicate, so the section adds noise without value. The data is preserved in the JSON.

  if (data.stack.length > 0) {
    lines.push('Stack trace:');
    for (const f of data.stack) lines.push(renderFrame(f));
  }

  if (data.cause) {
    if (lines.length > 0) lines.push('');
    lines.push(`Caused by: ${data.cause.name}: ${data.cause.message}`);
    for (const f of data.cause.stack) lines.push(renderFrame(f));
  }

  if (data.digest) {
    if (lines.length > 0) lines.push('');
    lines.push(`Digest: ${data.digest}`);
  }

  return lines.join('\n');
}

export { renderFrame };
export default renderOutput;
