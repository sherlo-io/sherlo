/**
 * TEXT AS A SINGLE-QUOTED STRING, the way a scene file writes it: a backslash and a quote inside
 * are escaped. Used by the `mockRequest(...)` lines a printout hands over (./mockRuleLine,
 * ./refusalExplanation).
 */

export function quoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
