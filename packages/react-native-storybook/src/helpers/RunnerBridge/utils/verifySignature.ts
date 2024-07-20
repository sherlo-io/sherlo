import JSEncrypt from 'jsencrypt';
import forge from 'node-forge';
import { publicKey } from '../data';

function hashData(data: string): string {
  const md = forge.md.sha256.create();
  md.update(data, 'utf8');
  return md.digest().toHex();
}

function verifySignature(data: string, signature: string): boolean {
  try {
    const jsEncrypt = new JSEncrypt();

    jsEncrypt.setPublicKey(publicKey);

    const isValid = jsEncrypt.verify(data, signature, hashData);

    return isValid;
  } catch (error) {
    console.error('Error during signature verification:', error);

    return false;
  }
}

export default verifySignature;
