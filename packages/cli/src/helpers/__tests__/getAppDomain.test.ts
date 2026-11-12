// Tests for getAppDomain (task omf-cli-build-links-env).
// The test names are the contract; never rename one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { posedSurroundings } from '../../seams/surroundings';
import getAppDomain, { LIVE_WEB_APP } from '../getAppDomain';

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

  it('a push against the test server links to the test web app', () => {
    expect(getAppDomain(undefined, 'https://dev-api.sherlo.io/graphql', 'prod')).toBe(
      'https://dev.app.sherlo.io'
    );
  });

  it('a push against the live server, or with no server set, links to the live web app', () => {
    expect(getAppDomain(undefined, 'https://api.sherlo.io/graphql', 'dev')).toBe(
      'https://app.sherlo.io'
    );
    expect(getAppDomain(undefined, undefined, 'prod')).toBe('https://app.sherlo.io');
  });

  it('a web app address set in the environment wins over the server', () => {
    expect(getAppDomain('https://app.example.test/', 'https://dev-api.sherlo.io/graphql')).toBe(
      'https://app.example.test'
    );
  });

  it('a set web app address wins over everything else', () => {
    process.env.SHERLO_APP_URL = 'https://app.example.test/';
    process.env.SHERLO_API_URL = 'https://api.example.test/graphql';

    expect(getAppDomain(undefined, undefined, 'dev')).toBe('https://app.example.test');
  });

  it("the CLI's tests render the live web app whatever stage the client was built for", () => {
    // Route 1: the environment the test run itself starts with.
    delete process.env.SHERLO_API_URL;
    if (savedEnv.SHERLO_APP_URL === undefined) delete process.env.SHERLO_APP_URL;
    else process.env.SHERLO_APP_URL = savedEnv.SHERLO_APP_URL;
    expect(getAppDomain(undefined, undefined, 'dev')).toBe(LIVE_WEB_APP);

    // Route 2: the environment a posed run installs in place of the whole one.
    const undo = posedSurroundings({ env: {}, git: 'none' }).installSettings();
    try {
      expect(getAppDomain(undefined, undefined, 'dev')).toBe(LIVE_WEB_APP);
    } finally {
      undo();
    }
  });
});
