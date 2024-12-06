import chalk from 'chalk';

function logBuildMessage({
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

  console.log(`${chalk[iconColor](icon)}  ${message}`);

  if (endsWithNewLine) console.log();
}

export default logBuildMessage;
