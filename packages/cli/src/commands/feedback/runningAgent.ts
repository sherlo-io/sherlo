/**
 * Which AI agent is running `sherlo feedback`, by name, so the report says who wrote it. An agent
 * is known by what its harness sets in the environment, never by a missing terminal: a person
 * piping a run into `tee`, or reading a CI log, is still a person. Only the agent's name is sent,
 * never its session id.
 */
export function runningAgent(): string | undefined {
  if (process.env.CLAUDECODE) return 'Claude Code';
  if (process.env.CURSOR_AGENT) return 'Cursor';
  return undefined;
}
