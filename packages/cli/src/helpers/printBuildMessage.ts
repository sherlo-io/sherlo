import chalk from 'chalk';

function printBuildMessage({
  message,
  type,
  endsWithNewLine,
}: {
  message: string;
  type: 'info' | 'success';
  endsWithNewLine?: boolean;
}) {
  const iconColor = type === 'success' ? 'green' : 'blue';
  const icon = type === 'success' ? '✔' : '➜';

  // Adding 2 spaces after the icon to align the text with section titles
  console.log(`${chalk[iconColor](icon)}  ${message}`);

  if (endsWithNewLine) console.log();
}

export default printBuildMessage;
