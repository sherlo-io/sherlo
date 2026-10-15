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

  it('a module with no code has no hash', () => {
    expect(hashModuleOutput({ output: [] })).toBeNull();
    expect(hashModuleOutput(undefined)).toBeNull();
  });
});
