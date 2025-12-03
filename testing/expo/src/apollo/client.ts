/**
 * Apollo Client instance for GraphQL queries
 * This is a realistic example of a client that would be mocked in tests
 */

// Mock Apollo Client for testing (we don't actually install @apollo/client)
// In a real app, you would import from '@apollo/client'
class MockApolloClient {
  private cache: any;
  private uri: string;

  constructor(config: { cache?: any; uri: string }) {
    this.cache = config.cache || {};
    this.uri = config.uri;
  }

  async query(options: { query: string; variables?: any }) {
    // Real implementation would make a GraphQL request
    return {
      data: {
        user: {
          id: '1',
          name: 'Real User',
          email: 'real@example.com',
        },
      },
    };
  }

  async mutate(options: { mutation: string; variables?: any }) {
    // Real implementation would make a GraphQL mutation
    return {
      data: {
        updateUser: {
          id: options.variables?.id || '1',
          name: options.variables?.name || 'Updated User',
        },
      },
    };
  }

  async watchQuery(options: { query: string; variables?: any }) {
    // Real implementation would return an observable
    return {
      subscribe: (callback: any) => {
        callback({
          data: {
            posts: [
              { id: '1', title: 'Real Post 1' },
              { id: '2', title: 'Real Post 2' },
            ],
          },
        });
        return { unsubscribe: () => {} };
      },
    };
  }
}

const WEB_BASE_URL = 'https://api.example.com/graphql';

export const client = new MockApolloClient({
  uri: WEB_BASE_URL,
});

export default client;
