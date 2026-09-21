'use strict';

// ---------------------------------------------------------------------------
// Story titles for the Diff Scope module manifest
// ---------------------------------------------------------------------------
//
// The manifest's story set is keyed by SOURCE FILE PATH, and the server narrows
// a build's capture scope by matching that key against the project's configured
// include/exclude lists. The runner on the device narrows by a different string
// entirely: a snapshot's display name, which prepareSnapshots.ts builds as
// `"<title> - <story name>"` - where <title> is the Storybook TITLE of the
// story's file. Paths and titles are two namespaces, so a server matching paths
// can drop a story the runner would photograph. This module emits the missing
// half: the title, read the same two ways Storybook reads it.
//
// Storybook titles a story file in exactly one of two ways (see
// @storybook/react-native's prepareStories -> userOrAutoTitleFromSpecifier):
//
//   1. the file's default export DECLARES `title` -> that string, with the
//      loader entry's titlePrefix joined in front;
//   2. it declares none -> the title is DERIVED from the file's path relative
//      to the loader entry's directory (deriveAutoTitle below is a port of
//      Storybook's own arithmetic, down to its file-name quirks).
//
// CERTAINTY IS THE WHOLE POINT. A title that is computed, imported or spread
// into the default export cannot be read without evaluating the file, and a
// Metro serializer must never evaluate anything. Every function here answers
// "I do not know" rather than guessing, and the manifest then omits that
// story's title: the server reads an absent title as "I cannot rule this story
// out", which costs a full capture and is safe. A GUESSED title would be the
// very defect this exists to remove - the fixture app's `Sanity/Hello` declares
// its title while its path derives `components/Sanity/Hello`, so the two forms
// genuinely differ and neither substitutes for the other.

var fs = require('fs');
var path = require('path');

// The Babel parser Metro already depends on, resolved exactly as mockScan.js
// resolves it, so this takes no dependency Metro does not already satisfy.
function getBabelParser() {
  try {
    return require('@babel/parser');
  } catch (_) {
    return require('metro-babel-transformer/node_modules/@babel/parser');
  }
}

function parseSource(source) {
  try {
    return getBabelParser().parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['typescript', 'jsx'],
    });
  } catch (_) {
    return null;
  }
}

function readFileOrNull(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch (_) {
    return null;
  }
}

// Strip TypeScript-only expression wrappers so we can see the ObjectExpression
// underneath `x satisfies T`, `x as T`, `<T>x`, `x!`, and `(x)`. Same set
// mockScan.js unwraps.
function unwrapExpression(node) {
  while (
    node &&
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'TSTypeAssertion' ||
      node.type === 'ParenthesizedExpression')
  ) {
    node = node.expression;
  }
  return node;
}

// The value of an object property whose key is written plainly as `name`.
// Computed and numeric keys are invisible here on purpose: we only read what a
// human wrote literally.
function propertyValue(objectExpression, name) {
  var props = objectExpression.properties || [];
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (prop.type !== 'ObjectProperty' || prop.computed || !prop.key) continue;
    var key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'StringLiteral'
        ? prop.key.value
        : null;
    if (key === name) return unwrapExpression(prop.value);
  }
  return null;
}

function hasSpread(objectExpression) {
  var props = objectExpression.properties || [];
  for (var i = 0; i < props.length; i++) {
    if (props[i].type === 'SpreadElement') return true;
  }
  return false;
}

// The string a node evaluates to, when that needs no evaluation at all: a plain
// string literal, or a template literal with no `${}` in it. Anything else
// returns null, which every caller treats as "not knowable".
function staticString(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The loader entries of a generated storybook.requires file
// ---------------------------------------------------------------------------

/**
 * The object literal `require.context(...)` was called inside, or null when the
 * node is not such a call. Recognises `require.context('../src', true, /re/)`
 * only - the exact shape @storybook/react-native's generator writes.
 */
function requireContextDirectoryArgument(node) {
  if (!node || node.type !== 'CallExpression') return null;
  var callee = node.callee;
  if (
    !callee ||
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.object.name !== 'require' ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'context'
  ) {
    return null;
  }
  return staticString(unwrapExpression(node.arguments[0]));
}

/**
 * Every story loader entry declared in a generated storybook.requires file.
 *
 * The generator writes one object per `stories` glob in `.rnstorybook/main.ts`,
 * each carrying the two fields Storybook titles with (`titlePrefix`,
 * `directory`) beside the `req: require.context(...)` that gathers the files.
 * We find the entries by that `req` call rather than by the array's name, so a
 * renamed or hand-edited file still reads.
 *
 * An entry whose three fields are not all plain literals is DROPPED rather than
 * half-read: a story whose loader entry is missing gets no title at all.
 *
 * @param {string} requiresAbsPath absolute path of storybook.requires.{ts,js}
 * @returns {{ contextDirAbsPath: string, directory: string, titlePrefix: string }[]}
 */
function readStoryLoaderEntries(requiresAbsPath) {
  var source = readFileOrNull(requiresAbsPath);
  if (source === null) return [];
  var ast = parseSource(source);
  if (!ast) return [];

  var entries = [];
  var requiresDir = path.dirname(requiresAbsPath);

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (typeof node.type !== 'string') return;

    if (node.type === 'ObjectExpression') {
      var contextDirArgument = requireContextDirectoryArgument(propertyValue(node, 'req'));
      if (contextDirArgument !== null) {
        var directory = staticString(propertyValue(node, 'directory'));
        var titlePrefix = staticString(propertyValue(node, 'titlePrefix'));
        if (directory !== null && titlePrefix !== null) {
          entries.push({
            contextDirAbsPath: path.resolve(requiresDir, contextDirArgument),
            directory: directory,
            titlePrefix: titlePrefix,
          });
        }
      }
    }

    for (var key in node) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
      if (key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') {
        continue;
      }
      walk(node[key]);
    }
  }

  walk(ast.program || ast);
  return entries;
}

// ---------------------------------------------------------------------------
// The title a story file declares, if it declares one knowably
// ---------------------------------------------------------------------------

function defaultExportedExpression(program) {
  var body = program.body || [];
  for (var i = 0; i < body.length; i++) {
    if (body[i].type === 'ExportDefaultDeclaration') return unwrapExpression(body[i].declaration);
  }
  return null;
}

/** The object literal a top-level `const <name> = { ... }` binds, or null. */
function topLevelObjectBinding(program, name) {
  var body = program.body || [];
  for (var i = 0; i < body.length; i++) {
    var statement = body[i];
    if (statement.type !== 'VariableDeclaration') continue;
    for (var d = 0; d < statement.declarations.length; d++) {
      var declarator = statement.declarations[d];
      if (declarator.id.type !== 'Identifier' || declarator.id.name !== name) continue;
      var init = unwrapExpression(declarator.init);
      return init && init.type === 'ObjectExpression' ? init : null;
    }
  }
  return null;
}

/**
 * What the story file's own default export says about its title.
 *
 * Returns one of three answers, and the caller must honour all three:
 *   { isKnown: false }                     - not readable without evaluating the
 *                                            file (computed/imported/spread
 *                                            title, an unresolvable default
 *                                            export, or no default export at all)
 *   { isKnown: true, declaredTitle: null } - the file certainly declares NO
 *                                            title, so Storybook derives one
 *                                            from its path
 *   { isKnown: true, declaredTitle: 'X' }  - the file declares exactly this
 *
 * Handles the two ordinary CSF forms: a default-exported object literal, and
 * the `const meta = {...}; export default meta;` form. A spread inside the meta
 * object is "not readable" whether or not a `title` is written beside it - the
 * spread could carry one, or override the one that is written.
 *
 * @param {string} source the story file's own source text
 */
function readDeclaredTitle(source) {
  var ast = parseSource(source);
  if (!ast) return { isKnown: false };
  var program = ast.program || ast;

  var meta = defaultExportedExpression(program);
  if (meta && meta.type === 'Identifier') meta = topLevelObjectBinding(program, meta.name);
  if (!meta || meta.type !== 'ObjectExpression') return { isKnown: false };
  if (hasSpread(meta)) return { isKnown: false };

  var title = propertyValue(meta, 'title');
  if (title === null) return { isKnown: true, declaredTitle: null };

  var declaredTitle = staticString(title);
  if (declaredTitle === null) return { isKnown: false };
  return { isKnown: true, declaredTitle: declaredTitle };
}

// ---------------------------------------------------------------------------
// Storybook's own title arithmetic, ported
// ---------------------------------------------------------------------------

/** Storybook's pathJoin: split every input on "/", drop the empty pieces. */
function joinPathSegments(parts) {
  var segments = [];
  for (var i = 0; i < parts.length; i++) {
    var pieces = String(parts[i]).split('/');
    for (var p = 0; p < pieces.length; p++) {
      if (pieces[p]) segments.push(pieces[p]);
    }
  }
  return segments;
}

/**
 * Storybook's `sanitize`: turn the last path segment (a file name) into a title
 * segment, dropping it entirely when it carries no meaning. Ported branch for
 * branch from autoTitle.ts so the three quirks below stay exact.
 */
function stripStoryFileName(segments) {
  if (segments.length === 0) return segments;

  var fileName = segments[segments.length - 1];
  var withoutExtension = fileName.replace(/(?:[.](?:story|stories))?([.][^.]+)$/i, '');
  if (segments.length === 1) return [withoutExtension];

  // "Button/Button.stories.tsx" titles as "Button" - the repeated folder name
  // is not said twice.
  var parentFolder = segments[segments.length - 2];
  if (withoutExtension.toLowerCase() === parentFolder.toLowerCase()) {
    return segments.slice(0, -2).concat(withoutExtension);
  }
  // "Button/stories.tsx" and "Button/index.tsx" title as "Button" - the file
  // name says nothing the folder has not already said.
  if (/^(story|stories)([.][^.]+)$/i.test(fileName) || /^index$/i.test(withoutExtension)) {
    return segments.slice(0, -1);
  }
  return segments.slice(0, -1).concat(withoutExtension);
}

/**
 * The title Storybook derives for a story file that declares none: its path
 * relative to the loader entry's context directory, with the entry's
 * titlePrefix in front and the file name stripped by the rules above.
 *
 * @param {{ contextDirAbsPath: string, directory: string, titlePrefix: string }} loaderEntry
 * @param {string} contextKey the story's require.context key ("./a/B.stories.tsx")
 */
function deriveAutoTitle(loaderEntry, contextKey) {
  // Storybook strips the entry's `directory` out of the key before joining.
  // For the shape the generator writes the key is already relative to that
  // directory, so this is usually a no-op - it is reproduced anyway because it
  // is not a no-op for a directory of "./", which loses the key's leading dot.
  var suffix = contextKey.replace(loaderEntry.directory, '');
  return stripStoryFileName(joinPathSegments([loaderEntry.titlePrefix, suffix])).join('/');
}

// ---------------------------------------------------------------------------
// The one question this module answers
// ---------------------------------------------------------------------------

/**
 * The loader entry that gathered a story, found by the directory its
 * require.context reads - the one thing Metro's graph and the generated file
 * both name. Null when no entry claims that directory.
 *
 * Two `stories` globs over the SAME directory (e.g. one for `*.stories.tsx` and
 * one for `*.mdx`) produce two entries this cannot tell apart: Storybook picks
 * between them with each entry's file-name matcher, which Metro's graph does not
 * carry. When such entries agree on the fields a title is built from, either one
 * gives the same answer and that answer is certain; when they disagree, any
 * choice is a guess, so this returns null and the stories go untitled.
 *
 * @param {{ contextDirAbsPath: string, directory: string, titlePrefix: string }[]} loaderEntries
 * @param {string|null} contextDirAbsPath
 */
function findLoaderEntry(loaderEntries, contextDirAbsPath) {
  if (!contextDirAbsPath) return null;
  var claiming = loaderEntries.filter(function (entry) {
    return entry.contextDirAbsPath === contextDirAbsPath;
  });
  if (claiming.length === 0) return null;
  for (var i = 1; i < claiming.length; i++) {
    if (
      claiming[i].directory !== claiming[0].directory ||
      claiming[i].titlePrefix !== claiming[0].titlePrefix
    ) {
      return null;
    }
  }
  return claiming[0];
}

/**
 * The title the runner will see for every story in `storyAbsPath`, or null when
 * it cannot be known without evaluating the file.
 *
 * Null is a real answer, not a failure: the manifest omits the story's title and
 * the server falls back to capturing it.
 *
 * @param {string} storyAbsPath absolute path of the story file
 * @param {{ contextDirAbsPath: string, directory: string, titlePrefix: string }} loaderEntry
 *        the loader entry that gathered this story (readStoryLoaderEntries)
 * @returns {string|null}
 */
function readStoryTitle(storyAbsPath, loaderEntry) {
  var source = readFileOrNull(storyAbsPath);
  if (source === null) return null;

  var declared = readDeclaredTitle(source);
  if (!declared.isKnown) return null;

  var title;
  if (declared.declaredTitle === null) {
    var contextKey =
      './' + path.relative(loaderEntry.contextDirAbsPath, storyAbsPath).split(path.sep).join('/');
    title = deriveAutoTitle(loaderEntry, contextKey);
  } else if (loaderEntry.titlePrefix) {
    title = joinPathSegments([loaderEntry.titlePrefix, declared.declaredTitle]).join('/');
  } else {
    title = declared.declaredTitle;
  }

  // @storybook/react-native's makeTitle strips one "./" from whatever the title
  // arithmetic produced; a derived title keeps the key's leading dot as a
  // segment until this point.
  return title.replace('./', '');
}

module.exports = {
  readStoryLoaderEntries: readStoryLoaderEntries,
  findLoaderEntry: findLoaderEntry,
  readDeclaredTitle: readDeclaredTitle,
  deriveAutoTitle: deriveAutoTitle,
  readStoryTitle: readStoryTitle,
};
