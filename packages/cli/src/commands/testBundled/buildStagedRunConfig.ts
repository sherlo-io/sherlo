/**
 * Per-platform staged run config constructor.
 *
 * Produces the fail-closed contract required by sherlo-runner#94:
 *   { url, baseReference, jsBundleUrl, assetsUrl?, bundleSizeMb }
 *
 * This is a PURE module - it does not call the network, upload files, or
 * interact with the API.  It only constructs the expected shape from its
 * inputs.  When SHERLO-1707 lands, the caller wires the returned config
 * into the openBuild API call.
 */

/** The exact per-platform staged run config shape (sherlo-runner#94). */
export interface StagedRunConfig {
  /** Build result URL (empty until a build is opened server-side). */
  url: string;
  /** Base fingerprint hash that identifies the binary to stage against. */
  baseReference: string;
  /** S3 key or URL pointing to the uploaded JS bundle. */
  jsBundleUrl: string;
  /** Optional S3 key or URL pointing to the uploaded assets archive. */
  assetsUrl?: string;
  /** Size of the JS bundle in megabytes. */
  bundleSizeMb: number;
}

/**
 * Construct a per-platform staged run config.
 *
 * `assetsUrl` is omitted from the returned object when it is `undefined`,
 * matching the optional-key semantics of the runner contract.
 */
export function buildStagedRunConfig({
  baseReference,
  jsBundleUrl,
  bundleSizeMb,
  assetsUrl,
}: {
  baseReference: string;
  jsBundleUrl: string;
  bundleSizeMb: number;
  assetsUrl?: string;
}): StagedRunConfig {
  const config: StagedRunConfig = {
    url: '',
    baseReference,
    jsBundleUrl,
    bundleSizeMb,
  };

  if (assetsUrl !== undefined) {
    config.assetsUrl = assetsUrl;
  }

  return config;
}
