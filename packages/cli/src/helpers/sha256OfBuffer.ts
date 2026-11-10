import crypto from 'crypto';

export function sha256OfBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
