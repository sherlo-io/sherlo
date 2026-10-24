/**
 * Parses an owner/repo slug out of any common git remote URL format.
 *
 * Handles HTTPS (https://host/owner/repo.git) and SSH (git@host:owner/repo.git) forms,
 * host-agnostic.
 */
export default function parseRepoSlug(remoteUrl: string): string | undefined {
  // SSH: git@host:owner/repo.git
  const sshMatch = remoteUrl.match(/^[^@]+@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  // HTTPS: https://host/owner/repo.git or http://host/owner/repo
  const httpsMatch = remoteUrl.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?(?:\/)?$/);
  if (httpsMatch) return httpsMatch[1];
  return undefined;
}
