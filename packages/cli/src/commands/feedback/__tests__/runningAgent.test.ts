/**
 * HOW AN AI AGENT IS RECOGNISED.
 */
import { defaultAgents } from 'agent-cli-detector';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runningAgent } from '../runningAgent';

describe('which agent is running the command', () => {
  beforeEach(() => {
    // The machine running this test may itself be inside an agent: start from a bare environment.
    for (const agent of defaultAgents) {
      for (const signal of agent.env ?? []) vi.stubEnv(signal.name, undefined);
      for (const sessionVariable of agent.sessionEnv ?? []) vi.stubEnv(sessionVariable, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('An agent is known by what its harness sets in the environment, never by a missing terminal', () => {
    // Nothing set: a person, whether or not the output is piped away from a terminal.
    expect(runningAgent()).toBeUndefined();

    vi.stubEnv('GEMINI_CLI', '1');
    expect(runningAgent()).toBe('Gemini CLI');

    vi.stubEnv('GEMINI_CLI', undefined);
    vi.stubEnv('CLAUDECODE', '1');
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session-that-must-not-leave');
    expect(runningAgent()).toBe('Claude Code');
  });
});
