/**
 * READING GRAPHQL QUERY TEXT, with no library: a tokenizer and a reader of just what a selection
 * needs - operations, fragment definitions, selection sets, aliases, fragments and directive
 * names. Arguments and variable definitions are skipped over by their parentheses. The answer
 * check walks what this reads (./graphqlAnswerCheck).
 */

/** The directives under which a field may be left out of an answer. */
const CONDITIONAL_DIRECTIVES = ['skip', 'include', 'defer'];

export type GraphqlField = {
  kind: 'field';
  /** The answer key: the alias when there is one, else the field name. */
  key: string;
  name: string;
  conditional: boolean;
  selections?: GraphqlSelection[];
};
export type GraphqlSelection =
  | GraphqlField
  | { kind: 'inline'; on?: string; conditional: boolean; selections: GraphqlSelection[] }
  | { kind: 'spread'; name: string; conditional: boolean };

export type GraphqlNamedFragment = { on: string; selections: GraphqlSelection[] };

export type GraphqlDocument = {
  operations: { name?: string; selections: GraphqlSelection[] }[];
  fragments: Map<string, GraphqlNamedFragment>;
};

type Token = { kind: 'name' | 'punctuator' | 'value'; text: string };

const PUNCTUATORS = '{}()[]:!$@=|&';

/** What a query text selects, or nothing when the text does not read as GraphQL. */
export function graphqlDocumentOf(text: string): GraphqlDocument | undefined {
  const tokens = tokensOf(text);
  if (tokens === undefined) return undefined;

  try {
    return readDocument(tokens);
  } catch (_) {
    // Query text that does not read as GraphQL (or is not GraphQL at all) is not checked.
    return undefined;
  }
}

function tokensOf(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  let at = 0;

  while (at < text.length) {
    const char = text[at];
    if (/[\s,﻿]/.test(char)) {
      at += 1;
    } else if (char === '#') {
      while (at < text.length && text[at] !== '\n' && text[at] !== '\r') at += 1;
    } else if (text.startsWith('"""', at)) {
      const end = blockStringEnd(text, at + 3);
      if (end < 0) return undefined;
      tokens.push({ kind: 'value', text: '"""' });
      at = end + 3;
    } else if (char === '"') {
      at += 1;
      while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1;
      if (at >= text.length) return undefined;
      tokens.push({ kind: 'value', text: '"' });
      at += 1;
    } else if (text.startsWith('...', at)) {
      tokens.push({ kind: 'punctuator', text: '...' });
      at += 3;
    } else if (PUNCTUATORS.includes(char)) {
      tokens.push({ kind: 'punctuator', text: char });
      at += 1;
    } else {
      const word = /^(?:[_A-Za-z][_0-9A-Za-z]*|-?[0-9][0-9.eE+-]*)/.exec(text.slice(at))?.[0];
      if (word === undefined) return undefined;
      tokens.push({ kind: /^[_A-Za-z]/.test(word) ? 'name' : 'value', text: word });
      at += word.length;
    }
  }
  return tokens;
}

function blockStringEnd(text: string, from: number): number {
  let at = text.indexOf('"""', from);
  while (at > 0 && text[at - 1] === '\\') at = text.indexOf('"""', at + 3);
  return at;
}

function readDocument(tokens: Token[]): GraphqlDocument {
  let at = 0;
  const peek = (): Token | undefined => tokens[at];
  const isPunctuator = (text: string): boolean =>
    tokens[at]?.kind === 'punctuator' && tokens[at].text === text;
  const isName = (): boolean => tokens[at]?.kind === 'name';
  const unreadable = (): Error => new Error('the query text does not read as GraphQL');

  const take = (text: string): void => {
    if (!isPunctuator(text)) throw unreadable();
    at += 1;
  };
  const name = (): string => {
    if (!isName()) throw unreadable();
    at += 1;
    return tokens[at - 1].text;
  };
  const skipParentheses = (): void => {
    take('(');
    for (let depth = 1; depth > 0; at += 1) {
      if (peek() === undefined) throw unreadable();
      if (isPunctuator('(')) depth += 1;
      if (isPunctuator(')')) depth -= 1;
    }
  };
  const directivesAreConditional = (): boolean => {
    let conditional = false;
    while (isPunctuator('@')) {
      at += 1;
      if (CONDITIONAL_DIRECTIVES.includes(name())) conditional = true;
      if (isPunctuator('(')) skipParentheses();
    }
    return conditional;
  };

  const selectionSet = (): GraphqlSelection[] => {
    take('{');
    const selections: GraphqlSelection[] = [];
    while (!isPunctuator('}')) {
      if (peek() === undefined) throw unreadable();
      selections.push(selection());
    }
    at += 1;
    return selections;
  };

  const selection = (): GraphqlSelection => {
    if (isPunctuator('...')) {
      at += 1;
      if (isName() && peek()?.text === 'on') {
        at += 1;
        const on = name();
        const conditional = directivesAreConditional();
        return { kind: 'inline', on, conditional, selections: selectionSet() };
      }
      if (isName()) {
        const spread = name();
        return { kind: 'spread', name: spread, conditional: directivesAreConditional() };
      }
      const conditional = directivesAreConditional();
      return { kind: 'inline', conditional, selections: selectionSet() };
    }

    const key = name();
    let fieldName = key;
    if (isPunctuator(':')) {
      take(':');
      fieldName = name();
    }
    if (isPunctuator('(')) skipParentheses();
    const conditional = directivesAreConditional();
    const selections = isPunctuator('{') ? selectionSet() : undefined;
    return {
      kind: 'field',
      key,
      name: fieldName,
      conditional,
      ...(selections !== undefined && { selections }),
    };
  };

  const document: GraphqlDocument = { operations: [], fragments: new Map() };
  while (peek() !== undefined) {
    if (isPunctuator('{')) {
      document.operations.push({ selections: selectionSet() });
      continue;
    }
    const keyword = name();
    if (keyword === 'fragment') {
      const fragmentName = name();
      if (name() !== 'on') throw unreadable();
      const on = name();
      directivesAreConditional();
      document.fragments.set(fragmentName, { on, selections: selectionSet() });
    } else if (keyword === 'query' || keyword === 'mutation' || keyword === 'subscription') {
      const operationName = isName() ? name() : undefined;
      if (isPunctuator('(')) skipParentheses();
      directivesAreConditional();
      document.operations.push({
        ...(operationName !== undefined && { name: operationName }),
        selections: selectionSet(),
      });
    } else {
      throw unreadable();
    }
  }
  return document;
}
