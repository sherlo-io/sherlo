import { graphqlAnswerFindings } from '../../mocking/graphqlAnswerCheck';
import { graphqlOperationOf } from '../../mocking/graphqlQueryText';
import { bodyExcerptOf, queryParamsOf } from '../../mocking/networkRequestText';

describe('a persisted query', () => {
  it('a persisted query with no text is checked by the schema the app ships, or said plainly as unchecked', () => {
    const URL = 'https://api.sherlo.invalid/graphql';
    const hash = 'ab12'.repeat(16);
    const body = JSON.stringify({
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
    });

    expect(graphqlOperationOf(URL, body)).toBe('persisted ab12ab12ab12');
    // No schema ships with the app's bundle, so it is said plainly: not checked.
    expect(graphqlAnswerFindings(URL, body, { data: { anything: 1 } })).toEqual([
      { kind: 'no-query-text', operation: 'persisted ab12ab12ab12' },
    ]);
    // The same request in a batch is said once for its item.
    expect(graphqlAnswerFindings(URL, `[${body}]`, [{ data: {} }])).toEqual([
      { kind: 'no-query-text', operation: 'persisted ab12ab12ab12' },
    ]);
  });
});

describe('the excerpt of a request body', () => {
  it('a plain text body is cut to its first 120 characters', () => {
    expect(bodyExcerptOf('text/plain;charset=UTF-8', 'a'.repeat(300))).toBe('a'.repeat(120));
  });

  it('a body of any other kind has no excerpt', () => {
    expect(bodyExcerptOf('application/octet-stream', 'binary')).toBeUndefined();
    expect(bodyExcerptOf('text/html', '<p>x</p>')).toBeUndefined();
    expect(bodyExcerptOf(undefined, 'no type')).toBeUndefined();
    expect(bodyExcerptOf('application/json', undefined)).toBeUndefined();
  });

  it('a JSON body that does not parse has no excerpt, as it may hold anything', () => {
    expect(bodyExcerptOf('application/json', 'token=abc')).toBeUndefined();
  });

  it('a JSON body keeps its keys and numbers and masks every string but the operation and query', () => {
    const body = JSON.stringify({
      operationName: 'Orders',
      query: '{ o }',
      n: 3,
      ok: false,
      tags: ['x'],
      v: { query: 'secret' },
    });

    expect(bodyExcerptOf('application/json', body)).toBe(
      '{"operationName":"Orders","query":"{ o }","n":3,"ok":false,"tags":["<text>"],"v":{"query":"<text>"}}'
    );
  });

  it('a form body keeps its keys and masks the values', () => {
    expect(
      bodyExcerptOf('application/x-www-form-urlencoded', 'name=Ann+Lee&page=2&query=%7Bx%7D')
    ).toBe('name=<text>&page=2&query=%7Bx%7D');
  });
});

describe('the parameters of a query string', () => {
  it('are read after the question mark, decoded, and without the fragment', () => {
    expect(queryParamsOf('https://x.invalid/g?a=1&b=two%20words&c#frag')).toEqual({
      a: '1',
      b: 'two words',
      c: '',
    });
  });
});
