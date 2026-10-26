import type { AnswerFinding } from '../sealedCore/seam';
import {
  graphqlOperationOf,
  jsonObjectOf,
  operationNameOf,
  persistedQueryHashOf,
  queryParamsOf,
} from './networkRequestText';
import { graphqlDocumentOf } from './graphqlQueryText';
import type { GraphqlField, GraphqlNamedFragment, GraphqlSelection } from './graphqlQueryText';

/**
 * WHAT A FAKED GRAPHQL ANSWER LACKS, READ FROM THE QUERY IT ANSWERS.
 *
 * A wrong faked answer fails silently in the app: a client cache that misses a `__typename` drops
 * the node with no error. So each answer a rule gives a GraphQL request is walked beside the
 * selection of the query text the request carried, and what it leaves out is a finding.
 *
 * Only the query text is read (./graphqlQueryText) - no schema, no library. The answer key of a
 * field is its alias, and fragments (inline, named, spread) are followed. A field answered with
 * null is fine; a field under @skip, @include or @defer may be absent. A fragment on a type is only
 * checked when the node's `__typename` names that type. A `__typename` that names none of the
 * fragment types at a node is a finding only when the node carries a field that only those
 * fragments select, each on a type proven concrete: with no schema an interface reads like any
 * other type, so a type counts as concrete only when the answer names it as some node's
 * `__typename` (an interface or union never is one). A node of another union member that carries
 * none of those fields is a right answer. A finding carries the operation, the
 * path and what was expected, and never a value of the answer or the request.
 */

// A list of a thousand items all missing one field says it in its first few.
const MOST_FINDINGS_PER_ANSWER = 20;

type Fragments = Map<string, GraphqlNamedFragment>;

type Walk = {
  operation?: string;
  fragments: Fragments;
  /** The types the answer names as some node's `__typename`: the ones proven concrete. */
  answeredTypes: Set<string>;
  findings: AnswerFinding[];
};

/**
 * What the faked `answerBody` lacks against the query a request to `url` with `body` carried.
 * A request that is not GraphQL, or whose query text does not read as GraphQL, gives nothing; a
 * persisted query sent with no text gives one `no-query-text` finding.
 */
export function graphqlAnswerFindings(
  url: string,
  body: string | undefined,
  answerBody: unknown
): AnswerFinding[] {
  const fromBody = jsonObjectOf(body);
  const fromUrl = url.includes('?') ? queryParamsOf(url) : {};
  const query = fromBody?.query ?? fromUrl.query;

  if (typeof query !== 'string' || query.trim() === '') {
    const extensions = fromBody?.extensions ?? jsonObjectOf(fromUrl.extensions);
    if (persistedQueryHashOf(extensions) === undefined) return [];
    return [finding('no-query-text', graphqlOperationOf(url, body))];
  }

  const document = graphqlDocumentOf(query);
  const data = dataOf(answerBody);
  if (document === undefined || data === undefined) return [];

  const namedInRequest = operationNameOf(body) || fromUrl.operationName || undefined;
  const chosen =
    document.operations.find((candidate) => candidate.name === namedInRequest) ??
    document.operations[0];
  if (chosen === undefined) return [];

  const walk: Walk = {
    operation: namedInRequest ?? chosen.name ?? graphqlOperationOf(url, body),
    fragments: document.fragments,
    answeredTypes: typenamesIn(data),
    findings: [],
  };
  walkNode(data, chosen.selections, [], walk);
  return walk.findings;
}

function dataOf(answerBody: unknown): Record<string, unknown> | undefined {
  const answer =
    typeof answerBody === 'string' ? jsonObjectOf(answerBody) : (answerBody as object | undefined);
  const data = (answer as { data?: unknown } | null | undefined)?.data;
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

function finding(
  kind: AnswerFinding['kind'],
  operation: string | undefined,
  path: string[] = [],
  expected?: string
): AnswerFinding {
  return {
    kind,
    ...(operation !== undefined && { operation }),
    ...(path.length > 0 && { path: path.join('.') }),
    ...(expected !== undefined && { expected }),
  };
}

function record(walk: Walk, found: AnswerFinding): void {
  if (walk.findings.length < MOST_FINDINGS_PER_ANSWER) walk.findings.push(found);
}

/** Walk one answer node beside the selection it answers; a list is walked item by item. */
function walkNode(node: unknown, selections: GraphqlSelection[], path: string[], walk: Walk): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkNode(item, selections, [...path, String(index)], walk));
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const answered = node as Record<string, unknown>;
  const typename = typeof answered.__typename === 'string' ? answered.__typename : undefined;
  const conditions = [...new Set(typeConditionsAt(selections, walk.fragments, new Set()))];
  const expectedTypes = conditions.length > 0 ? conditions.join(' | ') : undefined;
  const applying = mergedByKey(fieldsThatApply(selections, typename, walk.fragments, new Set()));

  if (typename !== undefined && expectedTypes !== undefined && !conditions.includes(typename)) {
    const readKeys = new Set(applying.map((field) => field.key));
    const unmatched = keysUnderUnmatchedFragments(selections, typename, walk, new Set());
    const mayBeInterface = new Set(unmatched.filter((key) => !key.proven).map(({ key }) => key));
    const neverRead = unmatched.filter(
      ({ key, proven }) =>
        proven && !mayBeInterface.has(key) && !readKeys.has(key) && answered[key] !== undefined
    );
    if (neverRead.length > 0) {
      record(walk, finding('typename-matches-no-fragment', walk.operation, path, expectedTypes));
    }
  }

  applying.forEach((field) => {
    const value = answered[field.key];
    if (value === undefined) {
      if (field.conditional) return;
      if (field.name === '__typename') {
        record(walk, finding('typename-missing', walk.operation, path, expectedTypes));
      } else {
        record(walk, finding('field-missing', walk.operation, [...path, field.key], field.name));
      }
      return;
    }
    if (field.selections !== undefined && value !== null) {
      walkNode(value, field.selections, [...path, field.key], walk);
    }
  });
}

/** A fragment a selection reaches, with the named fragments followed so far; none for a field. */
function fragmentOf(
  selection: GraphqlSelection,
  fragments: Fragments,
  spreadsFollowed: Set<string>
): { on?: string; selections: GraphqlSelection[]; followed: Set<string> } | undefined {
  if (selection.kind === 'field') return undefined;
  if (selection.kind === 'inline') return { ...selection, followed: spreadsFollowed };

  const named = fragments.get(selection.name);
  if (named === undefined || spreadsFollowed.has(selection.name)) return undefined;
  return { ...named, followed: new Set([...spreadsFollowed, selection.name]) };
}

/** Every type condition at a node: of its inline fragments and its spreads, nested ones too. */
function typeConditionsAt(
  selections: GraphqlSelection[],
  fragments: Fragments,
  spreadsFollowed: Set<string>
): string[] {
  return selections.flatMap((selection) => {
    const fragment = fragmentOf(selection, fragments, spreadsFollowed);
    if (fragment === undefined) return [];
    return [
      ...(fragment.on !== undefined ? [fragment.on] : []),
      ...typeConditionsAt(fragment.selections, fragments, fragment.followed),
    ];
  });
}

/**
 * The answer keys selected under a fragment on a type the node's `__typename` does not name, each
 * with whether every such fragment on its way is on a type proven concrete.
 */
function keysUnderUnmatchedFragments(
  selections: GraphqlSelection[],
  typename: string,
  walk: Walk,
  spreadsFollowed: Set<string>,
  underUnmatched?: { proven: boolean }
): { key: string; proven: boolean }[] {
  return selections.flatMap((selection) => {
    if (selection.kind === 'field') {
      return underUnmatched ? [{ key: selection.key, proven: underUnmatched.proven }] : [];
    }
    const fragment = fragmentOf(selection, walk.fragments, spreadsFollowed);
    if (fragment === undefined) return [];
    const unmatched =
      fragment.on !== undefined && fragment.on !== typename
        ? { proven: (underUnmatched?.proven ?? true) && walk.answeredTypes.has(fragment.on) }
        : underUnmatched;
    return keysUnderUnmatchedFragments(
      fragment.selections,
      typename,
      walk,
      fragment.followed,
      unmatched
    );
  });
}

/** Every `__typename` the answer names anywhere: each is a concrete type, never an interface. */
function typenamesIn(value: unknown, named: Set<string> = new Set()): Set<string> {
  if (typeof value !== 'object' || value === null) return named;
  const typename = (value as { __typename?: unknown }).__typename;
  if (typeof typename === 'string') named.add(typename);
  Object.values(value).forEach((inner) => typenamesIn(inner, named));
  return named;
}

/** The fields a node answers: its own, and those of every fragment its `__typename` lets apply. */
function fieldsThatApply(
  selections: GraphqlSelection[],
  typename: string | undefined,
  fragments: Fragments,
  spreadsFollowed: Set<string>,
  underCondition = false
): GraphqlField[] {
  return selections.flatMap((selection): GraphqlField[] => {
    const conditional = underCondition || selection.conditional;
    if (selection.kind === 'field') return [{ ...selection, conditional }];

    const fragment = fragmentOf(selection, fragments, spreadsFollowed);
    if (fragment === undefined) return [];
    if (fragment.on !== undefined && fragment.on !== typename) return [];
    return fieldsThatApply(
      fragment.selections,
      typename,
      fragments,
      fragment.followed,
      conditional
    );
  });
}

/** One field per answer key: a key selected twice is answered once, with both selections. */
function mergedByKey(fields: GraphqlField[]): GraphqlField[] {
  const byKey = new Map<string, GraphqlField>();
  fields.forEach((field) => {
    const seen = byKey.get(field.key);
    if (seen === undefined) {
      byKey.set(field.key, field);
      return;
    }
    const selections =
      seen.selections || field.selections
        ? [...(seen.selections ?? []), ...(field.selections ?? [])]
        : undefined;
    byKey.set(field.key, {
      ...seen,
      conditional: seen.conditional && field.conditional,
      ...(selections !== undefined && { selections }),
    });
  });
  return [...byKey.values()];
}
