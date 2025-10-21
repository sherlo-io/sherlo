import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import stripAnsi from './stripAnsi';

type Type = 'default' | 'warning' | 'command';

function wrapInBox({
  text,
  title,
  type,
  indent = 0,
}: {
  text: string;
  title?: string;
  type?: Type;
  indent?: number;
}): string {
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

  const indentString = indent > 0 ? ' '.repeat(indent) : '';
  const allLines = [topLine, ...contentLines, bottomLine];

  return allLines.map((line) => `${indentString}${line}`).join('\n');
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
  const maxBoxWidth = terminalWidth - 2 * (PADDING + BOX.VERTICAL.length);

  // Special handling for command type - split on -- flags only if needed
  if (type === 'command') {
    const styledText = chalk.cyan(text);
    const fullCommandLength = getVisibleLength(styledText);

    // If the full command fits in one line, keep it as one line
    if (fullCommandLength <= maxBoxWidth) {
      return [styledText];
    }

    // Otherwise, split on -- flags
    const parts = text.split(/(?=\s--)/);
    return parts.map((part, index) => {
      const trimmed = part.trim();
      const indented = index === 0 ? trimmed : `  ${trimmed}`;
      return chalk.cyan(indented);
    });
  }

  return wrapAnsi(text, maxBoxWidth, { trim: false })
    .split('\n')
    .map((line) => line.trimEnd());
}

function renderTopLine(title: string | undefined, maxLength: number, type?: Type): string {
  let titlePart = title ? ` ${title} ` : '';
  if (type === 'warning') titlePart = chalk.yellow(titlePart);
  else titlePart = chalk.blue(titlePart);

  return (
    borderColor([BOX.TOP_LEFT, BOX.HORIZONTAL.repeat(PADDING)].join(''), type) +
    titlePart +
    borderColor(
      [
        BOX.HORIZONTAL.repeat(maxLength - getVisibleLength(titlePart)),
        BOX.HORIZONTAL.repeat(PADDING),
        BOX.TOP_RIGHT,
      ].join(''),
      type
    )
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
    const backslash = !isLastLine ? chalk.cyan.dim(' \\') : '';
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
  return chalk.blue.dim(char);
}

function getVisibleLength(str: string): number {
  return stripAnsi(str).length;
}
