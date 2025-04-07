import { getCwd, runShellCommand, reporting } from '../../../helpers';

async function getEnvInfo(): Promise<Record<string, any> | undefined> {
  let result;

  try {
    const output = await runShellCommand({
      command: [
        'npx --yes envinfo',
        '--system',
        '--SDKs',
        '--IDEs',
        '--languages',
        '--binaries',
        '--npmPackages',
        '--npmGlobalPackages',
        '--json',
      ].join(' '),
      projectRoot: getCwd(),
    });

    result = JSON.parse(output);
  } catch (error) {
    reporting.captureException(error);
  }

  return result;
}

export default getEnvInfo;
