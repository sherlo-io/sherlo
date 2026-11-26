/** Rethrow a service's refusal of the token as {@link ServiceRefusedTokenError}, any other error as is. */
export function throwTokenRefusal(error: unknown): never {
  if (serviceRefusedTheToken(error)) throw new ServiceRefusedTokenError();
  throw error;
}

/** The service answered, and refused the token it was sent. */
export class ServiceRefusedTokenError extends Error {
  constructor() {
    super('Sherlo refused the token.');
    this.name = 'ServiceRefusedTokenError';
  }
}

/**
 * Whether an sdk client error is the service refusing the token, rather than a service the tool
 * never reached. The authorizer refuses with HTTP 401 or 403; a refusal from inside the API comes
 * back as a GraphQL error typed as unauthorized - thrown bare by the client, or inside its error.
 */
function serviceRefusedTheToken(error: unknown): boolean {
  const clientError = error as {
    errorType?: string;
    networkError?: { statusCode?: number };
    graphQLErrors?: Array<{ errorType?: string }>;
  };

  const httpStatus = clientError?.networkError?.statusCode;
  if (httpStatus === 401 || httpStatus === 403) return true;

  const errorTypes = [
    clientError?.errorType,
    ...(clientError?.graphQLErrors ?? []).map((graphQLError) => graphQLError.errorType),
  ];
  return errorTypes.some(isRefusalErrorType);
}

/**
 * THE ONE TEST of a GraphQL error's `errorType` for a refusal: AppSync's own `UnauthorizedException`,
 * or a type that says unauthorized or forbidden. A bare "auth" is not one: a resolver's own error
 * whose type merely contains the word (an author, an `authError` of its own) is the service's
 * answer, not a refused token.
 */
export function isRefusalErrorType(errorType: string | undefined): boolean {
  return /unauthori[sz]ed|forbidden/i.test(errorType ?? '');
}
