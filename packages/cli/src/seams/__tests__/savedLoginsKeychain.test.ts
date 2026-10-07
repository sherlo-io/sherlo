import { describe, expect, it } from 'vitest';

/**
 * TEST SHELLS for task login-keychain-cli (epic sherlo-login-hidden-tokens), written in plan. The
 * builder writes each body and makes it green under exactly this name (sherlo / Where the login is
 * kept).
 */
describe('the saved login in the keychain', () => {
  it('reads the keychain first, then the saved-login file', () => {
    expect.fail('shell - written in build');
  });

  it('falls back silently to the saved-login file when no keychain answers', () => {
    expect.fail('shell - written in build');
  });

  it("a save into the keychain deletes that address's entry from the file", () => {
    expect.fail('shell - written in build');
  });

  it('SHERLO_SAVED_LOGIN_STORE=file keeps the login in the file and never touches the keychain', () => {
    expect.fail('shell - written in build');
  });

  it('hands the token to security on its input, never in its arguments', () => {
    expect.fail('shell - written in build');
  });

  it('keeps a pending login until it expires, and forgets it once it is collected', () => {
    expect.fail('shell - written in build');
  });
});
