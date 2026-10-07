import { describe, expect, it } from 'vitest';

/**
 * TEST SHELLS for task login-flow-cli (epic sherlo-login-hidden-tokens), written in plan. The
 * builder writes each body and makes it green under exactly this name (sherlo / Logging in from the
 * terminal).
 */
describe('npx sherlo login, as it waits and resumes', () => {
  it('a second run waits on the pending login the first one left, with no new link', () => {
    expect.fail('shell - written in build');
  });

  it("says the login expired at the service's own expiry, never a fixed ten minutes", () => {
    expect.fail('shell - written in build');
  });

  it('says the browser is opening before it prints the link', () => {
    expect.fail('shell - written in build');
  });

  it('names npx sherlo init as the next step after Logged in as', () => {
    expect.fail('shell - written in build');
  });

  it('shows a spinner the result replaces on a terminal, and a plain waiting line elsewhere', () => {
    expect.fail('shell - written in build');
  });
});
