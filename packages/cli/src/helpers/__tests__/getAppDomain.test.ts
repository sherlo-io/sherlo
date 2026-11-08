// Tests for getAppDomain (task omf-cli-build-links-env).
// The test names are the contract; never rename one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import getAppDomain from '../getAppDomain';

describe('the web app address a build link names', () => {
  const savedEnv = {
    SHERLO_API_URL: process.env.SHERLO_API_URL,
    SHERLO_APP_URL: process.env.SHERLO_APP_URL,
  };

  // The defaults read these two variables, so no test may depend on the shell that runs it.
  beforeEach(() => {
    delete process.env.SHERLO_API_URL;
    delete process.env.SHERLO_APP_URL;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('the live API gives the live web app', () => {
    expect(getAppDomain(undefined, undefined, 'prod')).toBe('https://app.sherlo.io');
  });

  it('a dev or test API gives its own web app', () => {
    expect(getAppDomain(undefined, undefined, 'dev')).toBe('https://dev.app.sherlo.io');
    expect(
      getAppDomain('https://app.example.test/', 'https://api.example.test/graphql', 'prod')
    ).toBe('https://app.example.test');
  });

  it('an unknown API falls back to the live web app', () => {
    expect(getAppDomain(undefined, 'http://localhost:4000/graphql', 'dev')).toBe(
      'https://app.sherlo.io'
    );
    expect(getAppDomain(undefined, undefined, 'local')).toBe('https://app.sherlo.io');
  });

  it('a set web app address wins over everything else', () => {
    process.env.SHERLO_APP_URL = 'https://app.example.test/';
    process.env.SHERLO_API_URL = 'https://api.example.test/graphql';

    expect(getAppDomain(undefined, undefined, 'dev')).toBe('https://app.example.test');
  });
});
