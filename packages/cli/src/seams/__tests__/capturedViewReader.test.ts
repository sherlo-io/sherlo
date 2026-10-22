/**
 * THE VIEW TREE OFF THE WIRE (../capturedViewReader) - read the way the screen needs it, and an
 * app older than a field leaves that field absent.
 */
import { describe, expect, it } from 'vitest';
import { readCapturedView } from '../capturedViewReader';

describe('a view tree read off the wire', () => {
  it('keeps only the fields the app sent and fills in the lists', () => {
    expect(readCapturedView({ primitive: 'Text', text: 'Hi', testID: 'greeting' })).toEqual({
      primitive: 'Text',
      components: [],
      text: 'Hi',
      props: { testID: 'greeting' },
      children: [],
    });
  });

  it('reads every child, and drops what it cannot read', () => {
    expect(
      readCapturedView({
        primitive: 'View',
        components: ['Card', 3],
        size: { width: 10, height: 'tall' },
        children: [{ primitive: 'Text', size: { width: 1, height: 2 } }],
      })
    ).toEqual({
      primitive: 'View',
      components: ['Card'],
      children: [
        { primitive: 'Text', components: [], size: { width: 1, height: 2 }, children: [] },
      ],
    });
  });
});
