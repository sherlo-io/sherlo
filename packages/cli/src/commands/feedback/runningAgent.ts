/**
 * Which AI agent is running `sherlo feedback`, by name, so the report says who wrote it. An agent
 * is known by what its harness sets in the environment, never by a missing terminal: a person
 * piping a run into `tee`, or reading a CI log, is still a person. Only the agent's name is sent,
 * never its session id. Setup asks it too: a terminal an agent drives has nobody to press Enter
 * (../../seams/workstation `somebodyIsAtTheKeyboard`).
 */
import { detectAgent } from 'agent-cli-detector';

export function runningAgent(): string | undefined {
  return detectAgent().agent?.name;
}
