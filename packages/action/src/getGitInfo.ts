const UNKNOWN_GIT_INFO_DEFAULT = 'unknown';

import * as github from '@actions/github';
import { execSync } from 'child_process';

const execCommand = (command: string): string => {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch {
    return UNKNOWN_GIT_INFO_DEFAULT; // Return default if command fails
  }
};

export function getGitInfo(overrideCommitName?: string) {
  const { context } = github;

  // Try to get commit hash, branch name, and commit message using git
  const commitHash = execCommand('git rev-parse HEAD');
  const branchName = execCommand('git rev-parse --abbrev-ref HEAD');
  const commitName = overrideCommitName || execCommand('git log -1 --pretty=%B');

  // Fallback to context if git information is not available
  const fallbackCommitHash = context.sha || UNKNOWN_GIT_INFO_DEFAULT;
  let fallbackBranchName = UNKNOWN_GIT_INFO_DEFAULT;
  let fallbackCommitName = UNKNOWN_GIT_INFO_DEFAULT;

  // Check context for branch name and commit message
  switch (context.eventName) {
    case 'pull_request':
    case 'pull_request_target':
      fallbackBranchName = context.payload.pull_request?.head.ref || UNKNOWN_GIT_INFO_DEFAULT;
      break;
    case 'release':
      fallbackBranchName = `Release-${context.payload.release?.tag_name || UNKNOWN_GIT_INFO_DEFAULT}`;
      break;
    case 'push':
      fallbackBranchName = context.ref
        ? context.ref.split('refs/heads/')[1]
        : UNKNOWN_GIT_INFO_DEFAULT;
      break;
    case 'workflow_dispatch':
    case 'schedule':
      fallbackBranchName = UNKNOWN_GIT_INFO_DEFAULT; // No branch info available
      break;
    default:
      fallbackBranchName = context.ref
        ? context.ref.split('refs/heads/')[1]
        : UNKNOWN_GIT_INFO_DEFAULT;
      break;
  }

  fallbackCommitName =
    context.payload.head_commit?.message ||
    context.payload.commit?.message ||
    UNKNOWN_GIT_INFO_DEFAULT;

  return {
    commitHash: commitHash !== UNKNOWN_GIT_INFO_DEFAULT ? commitHash : fallbackCommitHash,
    branchName: branchName !== UNKNOWN_GIT_INFO_DEFAULT ? branchName : fallbackBranchName,
    commitName: commitName !== UNKNOWN_GIT_INFO_DEFAULT ? commitName : fallbackCommitName,
  };
}
