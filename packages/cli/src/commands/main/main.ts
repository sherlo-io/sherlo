import { getArguments, printHeader } from './helpers';
import { asyncInitMode, asyncUploadMode, closeBuildMode, syncMode } from './modes';

async function main(githubActionParameters?: Parameters<typeof getArguments>[0]): Promise<{
  buildIndex: number;
  url: string;
}> {
  printHeader();

  const args = getArguments(githubActionParameters);

  switch (args.mode) {
    case 'sync': {
      return syncMode(args);
    }

    case 'remoteExpo':
    case 'asyncInit': {
      return asyncInitMode(args, args.mode === 'remoteExpo');
    }

    case 'asyncUpload': {
      return asyncUploadMode(args);
    }

    case 'closeBuild': {
      return closeBuildMode(args);
    }
  }
}

export default main;
