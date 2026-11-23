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
  return errorTypes.some((errorType) => /unauthori[sz]ed|forbidden/i.test(errorType ?? ''));
}
