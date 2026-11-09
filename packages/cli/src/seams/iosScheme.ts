/**
 * The scheme an iOS build uses: the config's, else the workspace's only shared scheme, else the only
 * scheme that builds an application (a test bundle's or an extension's scheme is skipped, and said
 * so). Null when none of these picks one: two app schemes, or none, are the caller's refusal.
 */
export function pickIosScheme(params: {
  /** The scheme sherlo.config.json names. */
  named: string | undefined;
  /** The workspace's shared schemes. */
  schemes: string[];
  /** Those of them that build an application target. */
  appSchemes: string[];
}): { scheme: string; skippedSchemes: string[] } | null {
  const { named, schemes, appSchemes } = params;
  if (named) return { scheme: named, skippedSchemes: [] };
  if (schemes.length === 1) return { scheme: schemes[0], skippedSchemes: [] };
  if (appSchemes.length !== 1) return null;
  const [scheme] = appSchemes;
  return { scheme, skippedSchemes: schemes.filter((name) => name !== scheme) };
}
