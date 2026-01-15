type Params =
  | (BaseParams & { type: 'missing' })
  | (BaseParams & { type: 'version'; versions: { current: string; min: string } });

type BaseParams = { packageName: string };

function getPackageErrorMessage(params: Params) {
  if (params.type === 'missing') {
    return (
      `\`${params.packageName}\` package is not installed` +
      '\n\n' +
      `Please install \`${params.packageName}\` using your package manager`
    );
  }

  return (
    `\`${params.packageName}\` version \`${params.versions.current}\` is not supported (requires ≥\`${params.versions.min}\`)` +
    '\n\n' +
    `Please upgrade \`${params.packageName}\` to version \`${params.versions.min}\` or higher`
  );
}

export default getPackageErrorMessage;
