import runShellCommand from '../../runShellCommand';

async function getSizeInMB({
  path,
  buffer,
  projectRoot,
}: {
  path?: string;
  buffer?: Buffer;
  projectRoot: string;
}): Promise<string> {
  if (buffer) {
    return (buffer.length / 1024 / 1024).toFixed(2); // bytes to MB
  }

  if (path) {
    const duOutput = await runShellCommand({
      command: `du -sk "${path}"`,
      projectRoot,
    });

    const [sizeInKB] = duOutput.split('\t');
    return (parseInt(sizeInKB, 10) / 1024).toFixed(2); // KB to MB
  }

  throw new Error('Either path or buffer must be provided');
}

export default getSizeInMB;
