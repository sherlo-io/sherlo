/**
 * The fields the api accepts on a platform's build config at openBuild - the
 * input object type `BuildRunConfigPlatformInput` in sherlo-api
 * (`packages/api/src/graphql/schema/model/buildRun.graphql`). Hardcoded on
 * purpose: a field the CLI invents that is not in this set fails openBuild in
 * production with "The variables input contains a field that is not defined for
 * input object type 'BuildRunConfigPlatformInput'", so both roads pin the keys
 * they send against this set to fail locally instead. `baseReference` is
 * deliberately absent - the server stamps it from the top-level
 * `baseFingerprint`. Update this set only together with the schema.
 */
export const BUILD_RUN_CONFIG_PLATFORM_INPUT_KEYS = new Set([
  'devices',
  's3Key',
  'easUpdateUrl',
  'expoUpdateUrl',
  'bundleIdentifier',
  'packageName',
  'activity',
  'jsBundleS3Key',
  'assetsS3Key',
  'bundleSizeMb',
  'manifestS3Key',
]);

/** The keys on a platform config the api would reject. */
export function keysTheApiRejects(platformConfig: object): string[] {
  return Object.keys(platformConfig).filter(
    (key) => !BUILD_RUN_CONFIG_PLATFORM_INPUT_KEYS.has(key)
  );
}
