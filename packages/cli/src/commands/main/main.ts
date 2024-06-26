import { getArguments, printHeader } from './helpers';
import { asyncInitMode, asyncUploadMode, syncMode } from './modes';

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

    case 'asyncInit': {
      return asyncInitMode(args);
    }

    case 'asyncUpload': {
      return asyncUploadMode(args);
    }
  }
}

export default main;
