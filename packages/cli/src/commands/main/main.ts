import { printHeader } from '../../helpers';
import { getArguments } from './helpers';
import { asyncInitMode, asyncUploadMode, syncMode } from './modes';

async function main(githubActionParameters?: Parameters<typeof getArguments>[0]): Promise<{
  buildIndex: number;
  url: string;
}> {
  printHeader();

  console.log('githubActionParameters', JSON.stringify(githubActionParameters, null, 2));
  const args = getArguments(githubActionParameters);

  console.log('args', JSON.stringify(args, null, 2));
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
