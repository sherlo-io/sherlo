import chalk from 'chalk';

function printMessage({
  message,
  type,
  endsWithNewLine,
}: {
  message: string;
  type: keyof typeof TYPE_CONFIG;
  endsWithNewLine?: boolean;
}) {
  const { color, icon } = TYPE_CONFIG[type];

  console.log(`${chalk[color](icon)} ${message}`);

  if (endsWithNewLine) console.log();
}

export default printMessage;

/* ========================================================================== */

const TYPE_CONFIG = {
  info: { color: 'blue', icon: '➜' },
  success: { color: 'green', icon: '✔' },
  fail: { color: 'red', icon: '✖' },
  warning: { color: 'yellow', icon: '!' },
} as const;
