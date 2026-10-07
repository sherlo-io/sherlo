import { describe, expect, it } from 'vitest';

/**
 * TEST SHELLS for task login-flow-cli (epic sherlo-login-hidden-tokens), written in plan. The
 * builder writes each body and makes it green under exactly this name (sherlo / Teams, projects
 * and the personal token, The credential and the project of a push).
 */
describe('the login as the only credential a person spends', () => {
  it('spends the saved login and takes no personal token from a flag or the environment', () => {
    expect.fail('shell - written in build');
  });

  it('refuses with no saved login, naming npx sherlo login and no personal token', () => {
    expect.fail('shell - written in build');
  });

  it('refuses a personal token on --token by naming npx sherlo login, never a personal-token flag', () => {
    expect.fail('shell - written in build');
  });

  it('every command the tool names in its messages is written as npx sherlo', () => {
    expect.fail('shell - written in build');
  });
});
