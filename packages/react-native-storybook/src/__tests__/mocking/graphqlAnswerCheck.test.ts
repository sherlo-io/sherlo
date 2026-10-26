/**
 * A faked answer to a GraphQL request is checked against the query text the request carried: a
 * selected field the answer leaves out, or a type name it lacks, is a finding for the scene's
 * record (../../mocking/graphqlAnswerCheck). The check reads no schema and records no value.
 */
import { graphqlAnswerFindings } from '../../mocking/graphqlAnswerCheck';

const URL = 'https://api.sherlo.invalid/graphql';

/** A POST body carrying `query`, and the operation name when one is given. */
function post(query: string, operationName?: string): string {
  return JSON.stringify({ query, variables: { secret: 'never recorded' }, operationName });
}

describe('a faked GraphQL answer is checked against its query', () => {
  it('a selected field missing from a faked answer is a finding with its operation and path', () => {
    const query = 'query ShelfOfBooks { shelf { id books { title pages } } }';
    const answer = {
      data: { shelf: { id: 's1', books: [{ title: 'A', pages: 3 }, { title: 'B' }] } },
    };
    const expected = [
      {
        kind: 'field-missing',
        operation: 'ShelfOfBooks',
        path: 'shelf.books.1.pages',
        expected: 'pages',
      },
    ];

    expect(graphqlAnswerFindings(URL, post(query), answer)).toEqual(expected);
    // An answer given as text is read the same, and a GET carries its query in the address.
    const get = `${URL}?query=${encodeURIComponent(query)}&variables=%7B%7D`;
    expect(graphqlAnswerFindings(get, undefined, JSON.stringify(answer))).toEqual(expected);
    // The operation the body names wins over the one the query text names.
    expect(graphqlAnswerFindings(URL, post(query, 'Shelf'), answer)[0].operation).toBe('Shelf');
  });

  it('a field answered with null is not a finding', () => {
    const query = 'query ShelfOfBooks { shelf { id owner { name } books { title } } }';

    expect(graphqlAnswerFindings(URL, post(query), { data: { shelf: null } })).toEqual([]);
    expect(
      graphqlAnswerFindings(URL, post(query), {
        data: { shelf: { id: null, owner: null, books: [null, { title: null }] } },
      })
    ).toEqual([]);
    // An answer with no data - an error answer - has nothing to check.
    expect(graphqlAnswerFindings(URL, post(query), { errors: [{ message: 'no' }] })).toEqual([]);
  });

  it('a faked answer missing a __typename the query selects is a finding', () => {
    const query = 'query ShelfOfBooks { shelf { __typename id books { __typename title } } }';
    const answer = { data: { shelf: { id: 's1', books: [{ __typename: 'Book', title: 'A' }] } } };

    expect(graphqlAnswerFindings(URL, post(query), answer)).toEqual([
      { kind: 'typename-missing', operation: 'ShelfOfBooks', path: 'shelf' },
    ]);
  });

  it('a union node whose __typename matches no inline fragment is a finding naming the types expected', () => {
    const query = `query FindThings($term: String!) {
      results(term: $term, first: 10) {
        __typename
        ... on Book { title }
        ... on Author @important { name }
      }
    }`;
    const answer = {
      data: {
        results: [
          { __typename: 'Book', title: 'A' },
          { __typename: 'Magazine', title: 'M' },
          { __typename: 'Author' },
          { __typename: 'Poster' },
        ],
      },
    };

    // A fragment on a type the node does not name is not checked: the Book has no name to give.
    // The Magazine carries a title only the Book fragment selects, which the app never reads; the
    // Poster carries nothing a fragment selects, a right answer for a member the query skips.
    expect(graphqlAnswerFindings(URL, post(query), answer)).toEqual([
      {
        kind: 'typename-matches-no-fragment',
        operation: 'FindThings',
        path: 'results.1',
        expected: 'Book | Author',
      },
      { kind: 'field-missing', operation: 'FindThings', path: 'results.2.name', expected: 'name' },
    ]);
  });

  it('a node of a type no fragment names carrying no field only a fragment selects is not a finding', () => {
    // With no schema an interface reads like any type: a User answers "... on Node" rightly.
    const query = 'query Lookup { node(id: "n1") { __typename id ... on Node { label } } }';

    expect(
      graphqlAnswerFindings(URL, post(query), { data: { node: { __typename: 'User', id: 'u' } } })
    ).toEqual([]);
  });

  it('a node answering an interface fragment with its fields is not a finding', () => {
    // User and Post implement Node, and a real server sends Node's fields for each of them.
    const withLabel = 'query Lookup { node(id: "n1") { __typename id ... on Node { label } } }';
    const onlyUnderNode = 'query Lookup { node(id: "n1") { __typename ... on Node { id } } }';

    expect(
      graphqlAnswerFindings(URL, post(withLabel), {
        data: { node: { __typename: 'User', id: 'u', label: 'L' } },
      })
    ).toEqual([]);
    expect(
      graphqlAnswerFindings(URL, post(onlyUnderNode), {
        data: { node: { __typename: 'Post', id: 'p' } },
      })
    ).toEqual([]);
  });

  it('a field only a fragment on a type the answer never names selects is not a finding', () => {
    // No node of the answer is a Book, so "Book" may as well be an interface the Magazine has.
    const query = 'query FindThings { results { __typename ... on Book { title } } }';

    expect(
      graphqlAnswerFindings(URL, post(query), {
        data: { results: [{ __typename: 'Magazine', title: 'M' }] },
      })
    ).toEqual([]);
  });

  it("a named spread's type counts at its node, and is named among the types expected", () => {
    const query = `query FindThings {
      items { __typename ... on Book { title } ...AuthorCard }
    }
    fragment AuthorCard on Author { name ...AuthorLinks }
    fragment AuthorLinks on Author { homepage }`;
    const author = { __typename: 'Author', name: 'N', homepage: 'h' };

    expect(graphqlAnswerFindings(URL, post(query), { data: { items: [author] } })).toEqual([]);
    expect(
      graphqlAnswerFindings(URL, post(query), {
        data: { items: [author, { __typename: 'Magazine', homepage: 'h' }] },
      })
    ).toEqual([
      {
        kind: 'typename-matches-no-fragment',
        operation: 'FindThings',
        path: 'items.1',
        expected: 'Book | Author',
      },
    ]);
  });

  it('a field under @include or @defer may be absent from a faked answer', () => {
    const query = `query ShelfOfBooks($full: Boolean!) {
      shelf { id owner @include(if: false) { name } ... @defer { books { title } } }
    }`;

    expect(graphqlAnswerFindings(URL, post(query), { data: { shelf: { id: 's1' } } })).toEqual([]);
  });

  it('at most 20 findings are kept from one answer', () => {
    const query = 'query ShelfOfBooks { books { title } }';
    const books = Array.from({ length: 25 }, () => ({}));

    const findings = graphqlAnswerFindings(URL, post(query), { data: { books } });
    expect(findings).toHaveLength(20);
    expect(findings[19].path).toBe('books.19.title');
  });

  it('aliases, named fragments and spreads are followed', () => {
    const query = `
      # Two books side by side.
      query PairOfBooks($a: ID!) {
        first: book(id: $a) { ...BookCard }
        second: book(id: "b, }2") { ...BookCard ... on Book { id } }
        maybe: book(id: "b3") @skip(if: true) { id }
      }
      fragment BookCard on Book { __typename title by: author { ...AuthorName } }
      fragment AuthorName on Author { name }
    `;
    const answer = {
      data: {
        first: { __typename: 'Book', title: 'A', by: { name: 'N' } },
        second: { __typename: 'Book', title: 'B', author: { name: 'N' } },
      },
    };

    expect(graphqlAnswerFindings(URL, post(query), answer)).toEqual([
      { kind: 'field-missing', operation: 'PairOfBooks', path: 'second.by', expected: 'author' },
      { kind: 'field-missing', operation: 'PairOfBooks', path: 'second.id', expected: 'id' },
    ]);
  });

  it('a request with no query text is skipped and noted as such', () => {
    const persisted = JSON.stringify({
      operationName: 'ShelfOfBooks',
      extensions: { persistedQuery: { version: 1, sha256Hash: 'ab12'.repeat(16) } },
    });

    expect(graphqlAnswerFindings(URL, persisted, { data: {} })).toEqual([
      { kind: 'no-query-text', operation: 'ShelfOfBooks' },
    ]);
  });

  it('a faked answer to a request that is not GraphQL is not checked', () => {
    const answer = { data: { anything: 1 } };

    expect(graphqlAnswerFindings(`${URL}/books`, JSON.stringify({ title: 'A' }), answer)).toEqual(
      []
    );
    expect(graphqlAnswerFindings(`${URL}/books?page=2`, undefined, answer)).toEqual([]);
    expect(graphqlAnswerFindings(URL, 'plain text', answer)).toEqual([]);
    // Query text that does not read as GraphQL is not checked either.
    expect(graphqlAnswerFindings(URL, post('query Broken { shelf { id '), answer)).toEqual([]);
  });
});
