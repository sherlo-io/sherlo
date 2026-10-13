/**
 * Reads of Storybook's own fields (../getStorybook/storybookReads): the one guarded file that may
 * read a field of Storybook's starting with an underscore, and what such a read does when the
 * field is not there.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetStartedStorybookForTests,
  keepStartedStorybook,
  readStorybookChannel,
  readStorybooksCurrentStory,
  readWhetherStorybookNamedItsStory,
} from '../getStorybook/storybookReads';

// src: this file is at src/__tests__/.
const SDK_SOURCE_DIR = path.resolve(__dirname, '..');
const GUARDED_FILE = path.join(SDK_SOURCE_DIR, 'getStorybook', 'storybookReads.ts');

/**
 * A field of Storybook's own that is not on its public face: one underscore and a name (`_preview`,
 * `_storyIndex`, `_channel`), or one of the globals Storybook sets (`__STORYBOOK_ADDONS_CHANNEL__`).
 * Sherlo's own fields (`__sherloOriginalGetStorybookUI`, `__SHERLO_CORE__`) are not Storybook's.
 */
const STORYBOOKS_OWN_FIELD = /^_[A-Za-z]|^__STORYBOOK/;

afterEach(() => {
  __resetStartedStorybookForTests();
  delete (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__;
});

describe("reads of Storybook's own fields", () => {
  it("outside the one guarded file no module of the SDK reads a field of Storybook's that starts with an underscore", () => {
    const readsByFile = sdkSourceFiles().map((file) => ({
      file: path.relative(SDK_SOURCE_DIR, file),
      reads: storybookFieldsReadIn(file),
    }));

    const readsOutsideTheGuardedFile = readsByFile
      .filter(({ file }) => file !== path.relative(SDK_SOURCE_DIR, GUARDED_FILE))
      .flatMap(({ file, reads }) => reads.map((field) => `${file} reads ${field}`));
    expect(readsOutsideTheGuardedFile).toEqual([]);

    // The guarded file does read them, so the scan finds a read when there is one.
    expect(storybookFieldsReadIn(GUARDED_FILE)).toEqual(
      expect.arrayContaining(['_channel', '_preview', '__STORYBOOK_ADDONS_CHANNEL__'])
    );
  });

  it('a guarded read that finds nothing names the Storybook version in its error instead of throwing', () => {
    // A Storybook whose fields moved: none of the reads find what they look for.
    const storybookOfANewShape = {};
    keepStartedStorybook(storybookOfANewShape, '11.0.0');

    const reads = [
      () => readStorybookChannel(),
      () => readStorybooksCurrentStory(storybookOfANewShape),
      () => readWhetherStorybookNamedItsStory(storybookOfANewShape),
    ];
    for (const read of reads) {
      expect(read).not.toThrow();
      expect(read()).toEqual({
        value: null,
        error: expect.stringContaining('@storybook/react-native 11.0.0'),
      });
    }

    // A field that throws as it is read is answered the same way.
    const storybookThatThrows = {
      get _preview(): never {
        throw new Error('moved');
      },
    };
    expect(readStorybooksCurrentStory(storybookThatThrows)).toEqual({
      value: null,
      error: expect.stringContaining('@storybook/react-native 11.0.0'),
    });
  });

  it('reads the channel off the view first and the global last', () => {
    const channelOf = () => ({ on: () => {}, off: () => {}, emit: () => {} });
    const viewsChannel = channelOf();
    const globalChannel = channelOf();
    (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__ =
      globalChannel;

    keepStartedStorybook({ _channel: viewsChannel }, '9.1.4');
    expect(readStorybookChannel().value).toBe(viewsChannel);

    __resetStartedStorybookForTests();
    expect(readStorybookChannel().value).toBe(globalChannel);
  });
});

/* ========================================================================== */

/** Every TypeScript file of the SDK's own source, its tests and their stubs left out. */
function sdkSourceFiles(): string[] {
  const filesUnder = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : filesUnder(entryPath);
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [entryPath] : [];
    });
  return filesUnder(SDK_SOURCE_DIR);
}

/**
 * The fields of Storybook's own that `file` reads: every `a._field`, `a['_field']` and
 * `{ _field } = a`, as the compiler reads the file.
 */
function storybookFieldsReadIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const fields: string[] = [];
  const visit = (node: ts.Node): void => {
    let field: string | undefined;
    if (ts.isPropertyAccessExpression(node)) field = node.name.text;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      field = node.argumentExpression.text;
    }
    if (ts.isBindingElement(node)) {
      const name = node.propertyName ?? node.name;
      if (ts.isIdentifier(name)) field = name.text;
    }
    if (field && STORYBOOKS_OWN_FIELD.test(field)) fields.push(field);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...new Set(fields)];
}
