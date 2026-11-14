/**
 * THE COPY OF THE APP ENTRY AND A BABEL ALIAS (metro/launchTimeEntry.js): an entry file that imports
 * through an alias is rewritten by Babel against the copy's own folder. Shells; the fix makes them true.
 */
import { describe, it } from 'vitest';

describe('the copy of the app entry', () => {
  it.todo('the copy of the app entry resolves an import that Babel rewrote from an alias');
  it.todo('the copy of the app entry still resolves a plain relative import as the app entry does');
});
