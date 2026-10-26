/**
 * GraphQL query text read with no library (../../mocking/graphqlQueryText): what the answer check
 * walks a faked answer beside.
 */
import { graphqlDocumentOf } from '../../mocking/graphqlQueryText';

describe('reading GraphQL query text', () => {
  it('a query text is read into its operations and fragments, with aliases, spreads and conditions', () => {
    const document = graphqlDocumentOf(`
      query Shelf($id: ID! = "s,(1") @cached {
        mine: shelf(id: $id, where: { open: true }) { ...ShelfCard ... on Shelf @skip(if: true) { id } }
      }
      mutation { touch }
      fragment ShelfCard on Shelf { title(format: """a "block" string""") }
    `);

    expect(document?.operations).toEqual([
      {
        name: 'Shelf',
        selections: [
          {
            kind: 'field',
            key: 'mine',
            name: 'shelf',
            conditional: false,
            selections: [
              { kind: 'spread', name: 'ShelfCard', conditional: false },
              {
                kind: 'inline',
                on: 'Shelf',
                conditional: true,
                selections: [{ kind: 'field', key: 'id', name: 'id', conditional: false }],
              },
            ],
          },
        ],
      },
      { selections: [{ kind: 'field', key: 'touch', name: 'touch', conditional: false }] },
    ]);
    expect(document?.fragments.get('ShelfCard')?.on).toBe('Shelf');
  });

  it('text that does not read as GraphQL gives nothing', () => {
    expect(graphqlDocumentOf('shoes')).toBeUndefined();
    expect(graphqlDocumentOf('type Shelf { id: ID }')).toBeUndefined();
    expect(graphqlDocumentOf('{ shelf { id }')).toBeUndefined();
    expect(graphqlDocumentOf('{ shelf(name: "open) { id } }')).toBeUndefined();
  });
});
