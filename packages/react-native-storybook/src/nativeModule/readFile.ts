import base64 from 'base-64';
import utf8 from 'utf8';
import { normalizeFilePath } from './utils/normalizeFilePath';
import { getModule } from './getModule';

function readFile(filepath: string, encodingOrOptions?: any): Promise<string> {
  let options = {
    encoding: 'utf8',
  };

  if (encodingOrOptions) {
    if (typeof encodingOrOptions === 'string') {
      options.encoding = encodingOrOptions;
    } else if (typeof encodingOrOptions === 'object') {
      options = encodingOrOptions;
    }
  }

  return getModule()
    .readFile(normalizeFilePath(filepath))
    .then((b64: string) => {
      let contents;

      if (options.encoding === 'utf8') {
        contents = utf8.decode(base64.decode(b64));
      } else if (options.encoding === 'ascii') {
        contents = base64.decode(b64);
      } else if (options.encoding === 'base64') {
        contents = b64;
      } else {
        throw new Error(`Invalid encoding type "${String(options.encoding)}"`);
      }

      return contents;
    });
}

export default readFile;
