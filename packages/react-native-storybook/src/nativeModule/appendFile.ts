import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import { normalizeFilePath } from './utils/normalizeFilePath';

const { RNSherlo } = NativeModules;

function appendFile(filepath: string, contents: string, encodingOrOptions?: any): Promise<void> {
  let b64;

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

  if (options.encoding === 'utf8') {
    b64 = base64.encode(utf8.encode(contents));
  } else if (options.encoding === 'ascii') {
    b64 = base64.encode(contents);
  } else if (options.encoding === 'base64') {
    b64 = contents;
  } else {
    throw new Error(`Invalid encoding type "${options.encoding}"`);
  }

  return RNSherlo.appendFile(normalizeFilePath(filepath), b64);
}

export default appendFile;
