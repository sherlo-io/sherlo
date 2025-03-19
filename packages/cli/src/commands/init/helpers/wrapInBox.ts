import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import { stripAnsi } from '../../../helpers';

type Type = 'default' | 'warning' | 'command';

function wrapInBox({ text, title, type }: { text: string; title?: string; type?: Type }): string {
  const wrappedLines = getWrappedLines(text, type);
  const hasMultipleLines = type === 'command' && wrappedLines.length > 1;

  let exactTextLength = Math.max(...wrappedLines.map((line) => getVisibleLength(line)));

  // If it's a command with multiple lines, account for the backslash
  if (hasMultipleLines) {
    exactTextLength += 2; // space + backslash
  }

  const topLine = renderTopLine(title, exactTextLength, type);
  const contentLines = wrappedLines.map((line, index, array) =>
    renderContentLine(line, exactTextLength, type, index, array.length)
  );
  const bottomLine = renderBottomLine(exactTextLength, type);

  return [topLine, ...contentLines, bottomLine].join('\n');
}

export default wrapInBox;

/* ========================================================================== */

const PADDING = 1;

const BOX = {
  HORIZONTAL: '─',
  VERTICAL: '│',
  TOP_RIGHT: '╮',
  BOTTOM_RIGHT: '╯',
  BOTTOM_LEFT: '╰',
  TOP_LEFT: '╭',
};

function getWrappedLines(text: string, type?: Type): string[] {
  const terminalWidth = process.stdout.columns ?? 80;
  const backslashWidth = type === 'command' ? 2 : 0; // Space for " \"
  const maxBoxWidth = terminalWidth - 2 * (PADDING + BOX.VERTICAL.length) - backslashWidth;

  return wrapAnsi(text, maxBoxWidth, { trim: false })
    .split('\n')
    .map((line) => line.trimEnd());
}

function renderTopLine(title: string | undefined, maxLength: number, type?: Type): string {
  const titlePart = title ? ` ${title} ` : '';

  return borderColor(
    [
      BOX.TOP_LEFT,
      BOX.HORIZONTAL.repeat(PADDING),
      titlePart,
      BOX.HORIZONTAL.repeat(maxLength - titlePart.length),
      BOX.HORIZONTAL.repeat(PADDING),
      BOX.TOP_RIGHT,
    ].join(''),
    type
  );
}

function renderBottomLine(maxLength: number, type?: Type): string {
  return borderColor(
    [
      BOX.BOTTOM_LEFT,
      BOX.HORIZONTAL.repeat(PADDING),
      BOX.HORIZONTAL.repeat(maxLength),
      BOX.HORIZONTAL.repeat(PADDING),
      BOX.BOTTOM_RIGHT,
    ].join(''),
    type
  );
}

function renderContentLine(
  line: string,
  maxLength: number,
  type?: Type,
  lineIndex?: number,
  totalLines?: number
): string {
  const lineLength = getVisibleLength(line);
  const remainingSpace = ' '.repeat(maxLength - lineLength);

  // Special handling for command type
  if (type === 'command' && totalLines && totalLines > 1) {
    const isLastLine = lineIndex === totalLines - 1;
    const isFirstLine = lineIndex === 0;
    const backslash = !isLastLine ? ' \\' : '';
    const indent = !isFirstLine ? '  ' : '';

    // First line has left border, subsequent lines don't
    const leftBorder = isFirstLine
      ? [borderColor(BOX.VERTICAL, type), ' '.repeat(PADDING)].join('')
      : '';

    // Lines with backslash don't have right border
    const rightBorder = !backslash
      ? [' '.repeat(PADDING), borderColor(BOX.VERTICAL, type)].join('')
      : '';

    // Don't add remainingSpace when there's a backslash
    return [leftBorder, indent, line, !isLastLine ? backslash : remainingSpace, rightBorder].join(
      ''
    );
  }

  // Default rendering for other types
  return [
    borderColor(BOX.VERTICAL, type),
    ' '.repeat(PADDING),
    line,
    remainingSpace,
    ' '.repeat(PADDING),
    borderColor(BOX.VERTICAL, type),
  ].join('');
}

function borderColor(char: string, type?: Type) {
  if (type === 'warning') return chalk.yellow(char);
  return chalk.dim(char);
}

function getVisibleLength(str: string): number {
  return stripAnsi(str).length;
}
