import { Platform } from '@sherlo/api-types';
import crypto from 'crypto';
import fs from 'fs';

type BinaryHashes = { android?: string; ios?: string };

async function getBinaryHashes({
  platforms,
  androidPath,
  iosPath,
}: {
  platforms: Platform[];
  androidPath: string | undefined;
  iosPath: string | undefined;
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

  if (platforms.includes('android') && androidPath) {
    hashPromises.push(
      calculateHash(androidPath).then((hash) => {
        hashes.android = hash;
      })
    );
  }

  if (platforms.includes('ios') && iosPath) {
    hashPromises.push(
      calculateHash(iosPath).then((hash) => {
        hashes.ios = hash;
      })
    );
  }

  await Promise.all(hashPromises);

  return hashes;
}

export default getBinaryHashes;
