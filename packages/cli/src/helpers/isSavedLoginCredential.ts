import type { PushCredential } from '../types';

/**
 * Does this credential come from a person's saved login? Only then may a rejected token be told
 * as a login that has run out, since a project token or a GitHub session was never a login.
 */
function isSavedLoginCredential(credential: Pick<PushCredential, 'kind'>): boolean {
  return credential.kind === 'person';
}

export default isSavedLoginCredential;
