import { JsErrorJson } from './types';

// Hardcoded mapping from GraphQL URL to REST API URL.
// GraphQL is hosted on AppSync; REST is on API Gateway - separate hosts on test/dev/prod.
const GRAPHQL_TO_REST_URL: Record<string, string> = {
  'http://localhost:4000/graphql': 'http://localhost:4000',
  'https://ool47glntjfillpjchmfpuk2xy.appsync-api.eu-central-1.amazonaws.com/graphql':
    'https://v1eviezqn0.execute-api.eu-central-1.amazonaws.com/test',
  'https://d7sferturzea3jypippzn3j324.appsync-api.eu-central-1.amazonaws.com/graphql':
    'https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev',
  'https://w5qganqygzgh3lpouwf5wtyizm.appsync-api.eu-central-1.amazonaws.com/graphql':
    'https://mub7mj4ihc.execute-api.eu-central-1.amazonaws.com/prod',
};

// REST base URL. SHERLO_REST_API_URL takes precedence; otherwise we map from
// SHERLO_API_URL (GraphQL) to the corresponding REST URL via the table above.
// Customer-facing default is the prod REST API.
export function resolveApiBaseUrl(): string {
  const restUrl = process.env.SHERLO_REST_API_URL;
  if (restUrl) return restUrl.replace(/\/$/, '');

  const gqlUrl = process.env.SHERLO_API_URL;
  if (gqlUrl) {
    const mapped = GRAPHQL_TO_REST_URL[gqlUrl];
    if (mapped) return mapped;
    // Unknown GraphQL URL (custom deployment): fall back to stripping /graphql,
    // which is correct only when GraphQL and REST share a host.
    return gqlUrl.replace(/\/graphql$/, '');
  }

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
