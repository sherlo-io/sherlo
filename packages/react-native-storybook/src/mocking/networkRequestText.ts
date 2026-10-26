/**
 * WHAT AN UNANSWERED REQUEST CARRIES THAT AN AUTHOR CAN READ - and nothing a person typed.
 *
 * A request body holds passwords, tokens and personal data, and the record of unanswered requests
 * is printed. So the excerpt keeps the SHAPE of a JSON or form body (its keys, and the values of
 * "operationName" and "query"), turns every other string into "<text>" and lets numbers and
 * booleans stay. A plain text body is cut to its first characters; any other body has no excerpt.
 */

const EXCERPT_LENGTH = 120;
const MASKED = '<text>';
const KEPT_KEYS = ['operationName', 'query'];

/** The key and value pairs of a query string or a form-encoded body; an address may carry a "?" first. */
export function queryParamsOf(text: string): Record<string, string> {
  const afterQuestionMark = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const withoutFragment = afterQuestionMark.split('#')[0];
  const params: Record<string, string> = {};

  withoutFragment
    .split('&')
    .filter((pair) => pair !== '')
    .forEach((pair) => {
      const at = pair.indexOf('=');
      const key = at < 0 ? pair : pair.slice(0, at);
      const value = at < 0 ? '' : pair.slice(at + 1);
      params[decoded(key)] = decoded(value);
    });

  return params;
}

/** A short, masked excerpt of a text body, or nothing when its kind is not one that may be shown. */
export function bodyExcerptOf(
  contentType: string | undefined,
  body: string | undefined
): string | undefined {
  if (body === undefined || contentType === undefined) return undefined;
  const type = contentType.toLowerCase();

  if (type.includes('json')) return cut(maskedJson(body));
  if (type.includes('application/x-www-form-urlencoded')) return cut(maskedForm(body));
  if (type.includes('text/plain')) return cut(body);
  return undefined;
}

function maskedJson(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return JSON.stringify(mask(parsed, true));
  } catch (_) {
    return undefined;
  }
}

function maskedForm(body: string): string {
  const params = queryParamsOf(body);
  return Object.keys(params)
    .map((key) => {
      const kept = KEPT_KEYS.includes(key) || isNumberOrBoolean(params[key]);
      return `${encodeURIComponent(key)}=${kept ? encodeURIComponent(params[key]) : MASKED}`;
    })
    .join('&');
}

function mask(value: unknown, topLevel: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => mask(item, false));
  if (typeof value === 'string') return MASKED;
  if (typeof value !== 'object' || value === null) return value;

  const masked: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, inner]) => {
    const kept = topLevel && KEPT_KEYS.includes(key) && typeof inner === 'string';
    masked[key] = kept ? inner : mask(inner, false);
  });
  return masked;
}

function isNumberOrBoolean(text: string): boolean {
  return text === 'true' || text === 'false' || (text !== '' && !Number.isNaN(Number(text)));
}

function cut(text: string | undefined): string | undefined {
  return text === undefined ? undefined : text.slice(0, EXCERPT_LENGTH);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch (_) {
    return text;
  }
}
