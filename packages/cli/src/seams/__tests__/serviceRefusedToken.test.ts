import { describe, expect, it } from 'vitest';
import { ServiceRefusedTokenError, throwTokenRefusal } from '../serviceRefusedToken';

describe('the answer to a service that refuses the token (throwTokenRefusal)', () => {
  it('turns an HTTP 401 of the client into a refused token', () => {
    expect(() => throwTokenRefusal({ networkError: { statusCode: 401 } })).toThrow(
      ServiceRefusedTokenError
    );
  });

  it('turns a GraphQL error typed as unauthorized into a refused token', () => {
    expect(() =>
      throwTokenRefusal({ graphQLErrors: [{ errorType: 'UnauthorizedException' }] })
    ).toThrow(ServiceRefusedTokenError);
  });

  it('rethrows any other error as it came', () => {
    const other = new Error('network down');

    expect(() => throwTokenRefusal(other)).toThrow(other);
  });
});
