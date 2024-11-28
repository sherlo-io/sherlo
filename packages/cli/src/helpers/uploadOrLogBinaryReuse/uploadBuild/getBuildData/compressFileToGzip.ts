import fs from 'fs';
import zlib from 'zlib';

function compressFileToGzip(filePath: string): Buffer {
  const fileContent = fs.readFileSync(filePath);

  return zlib.gzipSync(fileContent);
}

export default compressFileToGzip;
