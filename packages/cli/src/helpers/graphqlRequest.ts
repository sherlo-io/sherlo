/**
 * THE RAW GRAPHQL POST behind the CLI's reads of a test - raw node-fetch and not the SDK client,
 * for three things the client does not give: 401/403 mapped to a non-retryable {@link AuthError},
 * a per-request timeout for the single-shot reads, and errors surfaced rather than thrown as
 * opaque client failures. All three are load-bearing for the exit-code contract.
 */
import fetch from 'node-fetch';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Post one query and answer its `data`. A refused token is an {@link AuthError}; any other failure
 * - HTTP, GraphQL - is an `Error` that says which.
 */
export async function postGraphql<Data>({
  endpointUrl,
  apiToken,
  query,
  variables,
  timeoutMs,
}: {
  endpointUrl: string;
  apiToken: string;
  query: string;
  variables: Record<string, unknown>;
  /** Callers bound the request so a slow API can never hang a run. */
  timeoutMs?: number;
}): Promise<Data | undefined> {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ authToken: apiToken }),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Authentication failed (HTTP ${response.status}) - check your token`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: Data; errors?: unknown[] };

  if (json.errors?.length) {
    const errorTypes = json.errors.map((e: any) => e?.errorType ?? '').filter(Boolean);
    const isAuthError = errorTypes.some((t: string) => /unauthorized|forbidden|auth/i.test(t));
    if (isAuthError) {
      throw new AuthError('Authentication failed - GraphQL authorization error. Check your token.');
    }
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}
