/**
 * The id of the build `eas build --no-wait --json` started, out of what it wrote: its answer is a
 * JSON list of the builds it started, `[{ "id": ..., "platform": "ANDROID", ... }]`, printed last,
 * after whatever it said on the way. Undefined when no such list is there.
 */
export function easBuildIdIn(output: string): string | undefined {
  // The list starts on a line of its own; the last one that reads as a list of builds is the answer.
  const listStarts = [...output.matchAll(/^\[/gm)].map((match) => match.index ?? 0).reverse();
  for (const start of listStarts) {
    try {
      const builds: unknown = JSON.parse(output.slice(start, output.lastIndexOf(']') + 1));
      const id = Array.isArray(builds) ? (builds[0] as { id?: unknown })?.id : undefined;
      if (typeof id === 'string') return id;
    } catch {
      // Not the answer: a line of its log that happened to start with a bracket.
    }
  }
  return undefined;
}
