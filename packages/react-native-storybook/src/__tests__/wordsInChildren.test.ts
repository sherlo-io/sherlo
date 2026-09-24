/**
 * WORDS IN CHILDREN - the pure rule captureTransport.test.ts's "a text view carries the words it
 * draws" exercises through the real fiber walk. This file tests wordsInChildren and its gate,
 * hostDrawsItsOwnChildrenAsWords, directly - the two pieces of metadataWalk.ts that decide it.
 */
import { describe, expect, it } from 'vitest';
import {
  hostDrawsItsOwnChildrenAsWords,
  wordsInChildren,
} from '../getStorybook/components/TestingMode/metadataWalk';

describe('wordsInChildren collects every word a children prop draws, in order', () => {
  it('collects a string child as a word', () => {
    const words: string[] = [];
    wordsInChildren('Hello', words);
    expect(words).toEqual(['Hello']);
  });

  it('collects a number child as the digits React draws it by', () => {
    const words: string[] = [];
    wordsInChildren(10, words);
    expect(words).toEqual(['10']);
  });

  it('walks an array of children in order, strings and numbers alike', () => {
    const words: string[] = [];
    wordsInChildren([10, 'px — The quick brown fox'], words);
    expect(words.join('')).toBe('10px — The quick brown fox');
  });

  it('enters a nested element through its own props.children, for a text span with no native view of its own', () => {
    const words: string[] = [];
    wordsInChildren(['Hello ', { props: { children: 'World' } }], words);
    expect(words.join('')).toBe('Hello World');
  });

  it.each([true, false, null, undefined])(
    'draws nothing for %s, the same as React itself draws it',
    (value) => {
      const words: string[] = [];
      wordsInChildren(value, words);
      expect(words).toEqual([]);
    }
  );
});

describe('a host only draws its children as words when it is a Text or a VirtualText', () => {
  it('is true for a Text host', () => {
    expect(hostDrawsItsOwnChildrenAsWords('RCTText')).toBe(true);
  });

  it('is true for a VirtualText host - a nested text span', () => {
    expect(hostDrawsItsOwnChildrenAsWords('RCTVirtualText')).toBe(true);
  });

  it('is false for a View, a ScrollView, or any other host that merely lays its children out', () => {
    expect(hostDrawsItsOwnChildrenAsWords('RCTView')).toBe(false);
    expect(hostDrawsItsOwnChildrenAsWords('RCTScrollView')).toBe(false);
    expect(hostDrawsItsOwnChildrenAsWords('RCTImageView')).toBe(false);
  });

  it('is false for a fiber typed by a component rather than a host string', () => {
    expect(hostDrawsItsOwnChildrenAsWords(function SomeComponent() {})).toBe(false);
  });
});
