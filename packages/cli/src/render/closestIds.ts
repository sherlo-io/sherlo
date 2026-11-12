/**
 * Which of an app's ids are nearest to the one typed: the words of a wrong story id are mostly
 * right, so the ids that share words come first, and a typo inside a word breaks the tie.
 */

/** How many single-character edits turn one string into the other. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const swap = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + swap
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * The known story ids, nearest to the asked one first: most words shared with it, then fewest
 * edits away, then the order the app listed them in.
 */
export function closestStoryIds(asked: string, known: string[]): string[] {
  const askedWords = wordsOf(asked);
  const sharedWords = (id: string) =>
    wordsOf(id).filter((word) => askedWords.includes(word)).length;

  return [...known].sort(
    (a, b) => sharedWords(b) - sharedWords(a) || editDistance(asked, a) - editDistance(asked, b)
  );
}

/** `components-button--primary` is the words components, button and primary. */
function wordsOf(storyId: string): string[] {
  return storyId
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}
