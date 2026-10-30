/**
 * THE `mockRequest(...)` LINES a printout hands over to paste into a scene file: the discover list
 * (./capturedScene) and the fakes a refusal explanation suggests (./refusalExplanation).
 */

/** The rule that answers a request, with its body left to fill in; a GraphQL request is matched by its operation name. */
export function ruleOf({
  method,
  url,
  operation,
}: {
  method: string;
  url: string;
  operation?: string;
}): string {
  const matcher = operation ? `operationName: ${quoted(operation)}` : `url: ${quoted(url)}`;
  return `mockRequest({ method: ${quoted(method)}, ${matcher} }, { body: /* fill in */ })`;
}

export function quoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
