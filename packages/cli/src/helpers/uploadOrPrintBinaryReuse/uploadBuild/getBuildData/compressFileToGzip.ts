import fs from 'fs';
import zlib from 'zlib';

async function compressFileToGzip(filePath: string): Promise<Buffer> {
  const fileContent = await fs.promises.readFile(filePath);

  return new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(fileContent, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export default compressFileToGzip;
