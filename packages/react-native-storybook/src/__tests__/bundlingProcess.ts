// The process a Metro config loads in, as a test plays it: the environment and command line the
// bundler wrapper reads (metro/withStorybook.js), and a way to put back the test's own.

const ENV_KEYS = ['SHERLO_BUILD', 'NODE_ENV', 'STORYBOOK_ENABLED', 'STORYBOOK_DISABLE_TELEMETRY'];

/**
 * Makes this process look like a bundling process with `env` set and `commandLine` after the
 * CLI's script: a debug build with no setting and Storybook's telemetry off, unless `env` says
 * otherwise. Returns the function that puts the environment and command line back.
 */
export function enterBundlingProcess(
  env: Record<string, string>,
  commandLine: string[]
): () => void {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  const savedCommandLine = process.argv;

  delete process.env.SHERLO_BUILD;
  delete process.env.STORYBOOK_ENABLED;
  process.env.NODE_ENV = 'development';
  process.env.STORYBOOK_DISABLE_TELEMETRY = 'true';
  Object.assign(process.env, env);
  process.argv = [process.argv[0], 'cli.js', ...commandLine];

  return function leaveBundlingProcess() {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    process.argv = savedCommandLine;
  };
}
