/**
 * ONE FINDING ABOUT A MOCK GRAPHQL ANSWER, as the app listed it.
 *
 * Pure, like everything under ./: the finding in, a line out.
 */
import type { AnswerFinding } from '../seams/readAppAnswer';

/** One finding about a mock GraphQL answer, as the app listed it. */
export function findingLine({ kind, operation, path, expected }: AnswerFinding): string {
  const where = `${operation ?? 'an operation'}${path ? ` at ${path}` : ''}`;
  const want = expected ? ` (expected ${expected})` : '';
  switch (kind) {
    case 'field-missing':
      return `  ${where}: the mock answer has no such field${want}`;
    case 'typename-missing':
      return `  ${where}: the mock answer has no __typename${want}`;
    case 'typename-matches-no-fragment':
      return `  ${where}: its __typename matches no fragment of the query${want}`;
    case 'field-extra':
      return `  ${where}: the mock answer has a field the query did not ask for`;
    case 'field-wrong-type':
      return `  ${where}: the mock answer has the wrong type${want}`;
    case 'no-query-text':
      return `  ${operation ?? 'a request'}: not checked, the request sent no query text`;
  }
}
