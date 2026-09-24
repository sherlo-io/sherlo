/**
 * A story declares the answers to the requests its screen makes, and the SDK answers fetch and
 * XMLHttpRequest from those rules while the story is active (sherlo-brain, books/sherlo/mocking-a-story.md).
 */
import { describe, it } from 'vitest';

describe('a request the story names', () => {
  it.todo('a matching request is answered from its rule with status, headers, body and delay');
  it.todo('a rule matches by method and a URL pattern, and a pattern may carry a wildcard');
  it.todo('a GraphQL request is matched by the operation name in its body');
  it.todo('a request made through XMLHttpRequest is answered by the same rules as fetch');
  it.todo('a body given as an object is sent as JSON with the content type set');
});

describe('a request no rule names', () => {
  it.todo('a request no rule matches throws and the story records it');
  it.todo('the refusal names the method and the address: no mock rule matches GET <url>');
  it.todo('a story that opts into passthrough lets an unmatched request reach the network');
  it.todo('a story with no network rules at all leaves fetch and XMLHttpRequest untouched');
});

describe('the rules follow the story', () => {
  it.todo('the rules are installed only in testing and storybook mode');
  it.todo(
    'switching stories replaces the rules, and clearing the mocks restores the real fetch and XMLHttpRequest'
  );
});
