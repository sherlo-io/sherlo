import { JsErrorJson } from './types';

// REST base URL. SHERLO_API_URL is the GraphQL endpoint; strip /graphql to get the HTTP base.
export function resolveApiBaseUrl(): string {
  const url = process.env.SHERLO_API_URL;
  if (url) return url.replace(/\/graphql$/, '');
  return 'https://api.sherlo.io';
}

export function resolveShowErrorUrl(slug: string): string {
  return `${resolveApiBaseUrl()}/v1/show-error/${slug}`;
}

async function fetchError(slug: string): Promise<JsErrorJson> {
  const errorUrl = resolveShowErrorUrl(slug);
  const res = await fetch(errorUrl);
  if (res.status === 404) {
    throw Object.assign(new Error(`No JS error found for build ${slug}`), { is404: true });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return JSON.parse(text) as JsErrorJson;
}

export default fetchError;
