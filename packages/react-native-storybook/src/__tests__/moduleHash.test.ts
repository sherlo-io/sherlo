'use strict';

/**
 * Diff Scope photographs a story only when a module it reaches changed. The test bundle is built
 * unminified (`--dev false --minify false`), so Metro's transformed output keeps the source's
 * comments and the blank lines between statements. A change no screen can show - a comment, a
 * re-indent, a type hint - must therefore not change the module's hash, while a real change still
 * must.
 */

const { hashModuleOutput } = require('../../metro/applySherloTransforms');

function moduleWithOutput(code: string) {
  return { output: [{ data: { code } }] };
}

function moduleImporting(dependencies: Map<string, unknown>) {
  return { ...moduleWithOutput(ORIGINAL), dependencies };
}

function plainImport(absolutePath: string) {
  return { absolutePath, data: { name: './theme', data: {} } };
}

function hashOf(code: string): string {
  return hashModuleOutput(moduleWithOutput(code));
}

// The transformed output of a SharedButton.tsx, as Metro writes it for the test bundle.
const ORIGINAL = `__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.SharedButton = SharedButton;
  var _theme = _$$_REQUIRE(_dependencyMap[0], "./theme");
  function SharedButton(props) {
    return (0, _theme.styled)("Press me", props.label);
  }
},"./src/SharedButton.tsx",[]);`;

const WITH_A_COMMENT = `__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.SharedButton = SharedButton;
  var _theme = _$$_REQUIRE(_dependencyMap[0], "./theme");
  // The one button every screen shares.
  function SharedButton(props) {
    /* the label comes from the caller */
    return (0, _theme.styled)("Press me", props.label);
  }
},"./src/SharedButton.tsx",[]);`;

const RE_INDENTED = `__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SharedButton = SharedButton;

    var _theme = _$$_REQUIRE(_dependencyMap[0], "./theme");

    function SharedButton(props) {
        return (0, _theme.styled)(
            "Press me",
            props.label
        );
    }
},"./src/SharedButton.tsx",[]);`;

// A type alias and a parameter type are stripped by the transform, but the blank lines they
// stood on are kept.
const WITH_A_TYPE_HINT = `__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.SharedButton = SharedButton;
  var _theme = _$$_REQUIRE(_dependencyMap[0], "./theme");



  function SharedButton(props) {
    return (0, _theme.styled)("Press me", props.label);
  }
},"./src/SharedButton.tsx",[]);`;

const WITH_A_CHANGED_LITERAL = ORIGINAL.replace('"Press me"', '"Tap me"');
const WITH_A_CHANGED_CALL = ORIGINAL.replace('_theme.styled)', '_theme.plain)');
const WITH_A_CHANGED_IMPORT = ORIGINAL.replace('"./theme"', '"./darkTheme"');

describe('hashModuleOutput', () => {
  it("a module's hash ignores comments, indentation and type annotations", () => {
    expect(hashOf(WITH_A_COMMENT)).toBe(hashOf(ORIGINAL));
    expect(hashOf(RE_INDENTED)).toBe(hashOf(ORIGINAL));
    expect(hashOf(WITH_A_TYPE_HINT)).toBe(hashOf(ORIGINAL));
  });

  it("a module's hash changes with a changed literal, call or import", () => {
    expect(hashOf(WITH_A_CHANGED_LITERAL)).not.toBe(hashOf(ORIGINAL));
    expect(hashOf(WITH_A_CHANGED_CALL)).not.toBe(hashOf(ORIGINAL));
    expect(hashOf(WITH_A_CHANGED_IMPORT)).not.toBe(hashOf(ORIGINAL));
  });

  it('a module whose output cannot be parsed is still hashed, by its exact code', () => {
    expect(hashOf('not { javascript')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf('not { javascript')).not.toBe(hashOf('not {  javascript'));
  });

  it("a module's hash changes when one of its imports resolves to another file", () => {
    const root = '/app';
    const before = moduleImporting(new Map([['t', plainImport('/app/src/theme.ts')]]));
    const repointed = moduleImporting(new Map([['t', plainImport('/app/src/darkTheme.ts')]]));

    expect(hashModuleOutput(repointed, root)).not.toBe(hashModuleOutput(before, root));
    expect(hashModuleOutput(before, root)).toBe(hashModuleOutput(before, root));
  });

  it("a module's hash is the same when its imports resolve to the same files under another project root", () => {
    const underOne = moduleImporting(new Map([['t', plainImport('/one/app/src/theme.ts')]]));
    const underAnother = moduleImporting(new Map([['t', plainImport('/two/app/src/theme.ts')]]));

    expect(hashModuleOutput(underOne, '/one/app')).toBe(hashModuleOutput(underAnother, '/two/app'));
  });

  it('a require.context import is hashed by its specifier, not by its synthetic path', () => {
    const contextImport = (syntheticPath: string, name: string) => ({
      absolutePath: syntheticPath,
      data: { name, data: { contextParams: {} } },
    });
    const first = moduleImporting(
      new Map([['c', contextImport('/app/src/x.ts?ctx=aaa', './icons')]])
    );
    const second = moduleImporting(
      new Map([['c', contextImport('/app/src/x.ts?ctx=bbb', './icons')]])
    );
    const otherFolder = moduleImporting(
      new Map([['c', contextImport('/app/src/x.ts?ctx=aaa', './logos')]])
    );

    expect(hashModuleOutput(first, '/app')).toBe(hashModuleOutput(second, '/app'));
    expect(hashModuleOutput(otherFolder, '/app')).not.toBe(hashModuleOutput(first, '/app'));
  });

  it('a module with no code has no hash', () => {
    expect(hashModuleOutput({ output: [] })).toBeNull();
    expect(hashModuleOutput(undefined)).toBeNull();
  });
});
