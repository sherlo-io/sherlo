import { Command } from '../../types';

type Params =
  | (BaseParams & { type: 'missing' })
  | (BaseParams & { type: 'version'; versions: { current: string; min: string } });

type BaseParams = { packageName: string; command?: Command };

function getPackageErrorMessage(params: Params) {
  if (params.type === 'missing') {
    const message = params.command
      ? `\`sherlo ${params.command}\` command requires \`${params.packageName}\` package`
      : `\`${params.packageName}\` package is not installed`;

    return message + '\n\n' + `Please install \`${params.packageName}\` using your package manager`;
  }

  const message = params.command
    ? `\`sherlo ${params.command}\` command requires \`${params.packageName}\` version ≥\`${params.versions.min}\` (current: \`${params.versions.current}\`)`
    : `\`${params.packageName}\` version \`${params.versions.current}\` is not supported (requires ≥\`${params.versions.min}\`)`;

  return (
    message +
    '\n\n' +
    `Please upgrade \`${params.packageName}\` to version \`${params.versions.min}\` or higher`
  );
}

export default getPackageErrorMessage;
