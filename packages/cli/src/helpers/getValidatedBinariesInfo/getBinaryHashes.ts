import { Platform } from '@sherlo/api-types';
import crypto from 'crypto';
import fs from 'fs';
import { Config } from '../../types';

type BinaryHashes = { android?: string; ios?: string };

async function getBinaryHashes({
  platformsToTest,
  config,
}: {
  platformsToTest: Platform[];
  config: Config<'withBuildPaths'>;
}): Promise<BinaryHashes> {
  const hashes: BinaryHashes = {};

  const calculateHash = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  };

  const hashPromises: Promise<void>[] = [];

  if (platformsToTest.includes('android') && config.android) {
    hashPromises.push(
      calculateHash(config.android).then((hash) => {
        hashes.android = hash;
      })
    );
  }

  if (platformsToTest.includes('ios') && config.ios) {
    hashPromises.push(
      calculateHash(config.ios).then((hash) => {
        hashes.ios = hash;
      })
    );
  }

  await Promise.all(hashPromises);

  return hashes;
}

export default getBinaryHashes;
