import { PERSONAL_TOKEN_PREFIX } from '@sherlo/api-types';
import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import type { FeedbackContext } from '../../seams/serverCalls';

/**
 * Anything shaped like a token or a key, replaced by a placeholder, so a report or an error line
 * that quotes one never leaves the machine with it in.
 */
export const BLANKED = '[blanked]';

const SECRET_SHAPES: RegExp[] = [
  // A Sherlo personal token.
  new RegExp(`\\b${PERSONAL_TOKEN_PREFIX}[A-Za-z0-9_-]{8,}`, 'g'),
  // A bearer token in an Authorization header.
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // A JSON web token: three dot-separated parts, the first starting with `eyJ`.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  // A common API key: `sk-...`, GitHub and GitLab tokens, Slack tokens, AWS and Google keys.
  /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat|glpat)_[A-Za-z0-9_]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  // A Sherlo project token: 32 random characters, the team id and the project number, unbroken.
  new RegExp(`\\b[A-Za-z0-9]{${PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH},}\\b`, 'g'),
];

export function blankSecrets(text: string): string {
  return SECRET_SHAPES.reduce((blanked, shape) => blanked.replace(shape, BLANKED), text);
}

/** The report and the last command's error lines with every token and key blanked out: all that may leave. */
export function blankReportAndErrorLines(
  report: string,
  context: FeedbackContext
): { report: string; context: FeedbackContext } {
  const { lastCommand } = context;

  return {
    report: blankSecrets(report),
    context: {
      ...context,
      lastCommand: lastCommand && {
        ...lastCommand,
        errorLines: lastCommand.errorLines.map(blankSecrets),
      },
    },
  };
}
