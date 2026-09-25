// EVERY DOOR IS A SEAM (sherlo / The seams, "Every door is a seam"). Outside src/seams/, a
// command must reach the network, a socket, a process, or a file outside the project folder
// only through a seam - never directly. Enforced below for packages/cli/src/**, and proved on
// the whole tree by packages/cli/src/__tests__/doors-are-seams.test.ts, which lists every named
// exception with its reason and fails by name on a new violation.

// child_process, http, https and net have no export that ISN'T a door to the machine or the
// network - so banning the import bans the closed set of calls those modules exist to make.
const NODE_CORE_DOORS = ['child_process', 'http', 'https', 'net'];
const NODE_CORE_DOOR_SYNTAX = [
  {
    selector: `ImportDeclaration[source.value=/^(${NODE_CORE_DOORS.join('|')})$/]`,
    message:
      'A door outside src/seams/ - this module belongs to the live half of the seam that owns it, reached only from its seam or from another live half (see packages/cli/src/__tests__/doors-are-seams.test.ts).',
  },
  {
    selector: `CallExpression[callee.name='require'][arguments.0.value=/^(${NODE_CORE_DOORS.join(
      '|'
    )})$/]`,
    message:
      'A door outside src/seams/ - this module belongs to the live half of the seam that owns it, reached only from its seam or from another live half (see packages/cli/src/__tests__/doors-are-seams.test.ts).',
  },
];

// A file outside src/seams/ escapes the project folder only by reaching for one of these three:
// the process's own cwd, the OS temp/home directories, or its own install location. Every
// legitimate path is instead built from projectFiles().root() (or a value that came from it),
// which never needs any of the three.
const FS_ROOT_ESCAPE_SYNTAX = [
  {
    selector: "CallExpression[callee.object.name='process'][callee.property.name='cwd']",
    message:
      'A file read outside the project folder seam (packages/cli/src/seams/projectFiles.ts) - resolve paths from projectFiles().root() instead.',
  },
  {
    selector: "CallExpression[callee.object.name='os'][callee.property.name=/^(tmpdir|homedir)$/]",
    message:
      'A file read outside the project folder seam (packages/cli/src/seams/projectFiles.ts) - resolve paths from projectFiles().root() instead.',
  },
  {
    selector: "Identifier[name='__dirname']",
    message:
      'A file read outside the project folder seam (packages/cli/src/seams/projectFiles.ts) - resolve paths from projectFiles().root() instead.',
  },
];

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'react-native/no-inline-styles': 'off',
    'react/react-in-jsx-scope': 'off',
    curly: ['error', 'multi-line'],
    // Allow the _name convention for intentionally-unused destructured bindings
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      // The GitHub Action's library (actions/lib) is plain ES modules run by node
      // on a CI runner - no bundler, no TypeScript. The default parser config
      // here targets the app's .ts sources and cannot parse `import.meta`.
      files: ['*.mjs'],
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      env: { node: true, es2022: true },
    },
    {
      // EVERY DOOR IS A SEAM. Everything under packages/cli/src/**, except the seams themselves
      // (which ARE the doors) and test files (which pose as anything they like).
      files: ['packages/cli/src/**/*.ts'],
      excludedFiles: ['packages/cli/src/seams/**', '**/__tests__/**'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@sherlo/sdk-client',
                // Only the CLIENT (the default export) is a door - a named constant like `ENV`
                // is data, not a call, and stays importable anywhere (e.g. helpers/reporting.ts).
                importNames: ['default'],
                allowTypeImports: true,
                message:
                  'A door outside src/seams/ - every real call goes through packages/cli/src/seams/serverCalls.ts, which builds its own client from a token. Take a token, not a client.',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          {
            name: 'fetch',
            message:
              'A door outside src/seams/ - reach the network through packages/cli/src/seams/serverCalls.ts or packages/cli/src/seams/nativeBuild.ts.',
          },
        ],
        'no-restricted-syntax': ['error', ...NODE_CORE_DOOR_SYNTAX, ...FS_ROOT_ESCAPE_SYNTAX],
      },
    },
    {
      // THE EAS HOOKS, showError, AND THE POSE DEVTOOLS - not posable, or the tool that poses
      // everything else. See doors-are-seams.test.ts for the reason each one holds.
      files: [
        'packages/cli/src/commands/easBuildOnComplete/**',
        'packages/cli/src/commands/testEasCloudBuild/**',
        'packages/cli/src/commands/showError/**',
        'packages/cli/src/commands/pose/**',
      ],
      rules: {
        '@typescript-eslint/no-restricted-imports': 'off',
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      // THE LIVE HALF OF A SEAM. Reached only from its seam or from another live half
      // (doors-are-seams.test.ts asserts exactly that reach - the full named set lives there),
      // so the node-core call it makes is never taken by a posed run - only the sdk-client and
      // fs rules still apply here.
      files: [
        // nativeBuild (packages/cli/src/seams/nativeBuild.ts)
        'packages/cli/src/helpers/uploadOrPrintBinaryReuse/uploadBuild/uploadBuild.ts',
        // bundler (packages/cli/src/seams/bundler.ts)
        'packages/cli/src/commands/test/buildBundle.ts',
        // workstation (packages/cli/src/seams/workstation.ts)
        'packages/cli/src/helpers/runShellCommand/executeCommand.ts',
        'packages/cli/src/helpers/runShellCommand/tryToFixPermissionAndRetryOnce.ts',
      ],
      rules: {
        'no-restricted-syntax': ['error', ...FS_ROOT_ESCAPE_SYNTAX],
      },
    },
    {
      // THE LIVE HALF OF THE nativeBuild SEAM, AND A SCRATCH TARBALL. Reached only from
      // packages/cli/src/seams/nativeBuild.ts, so its child_process/http calls never run posed -
      // and the tarball it builds under the OS temp directory (packed, uploaded, then deleted) is
      // the one file this run ever reads there, never anything left over from another run.
      files: ['packages/cli/src/commands/test/uploadStagedArtifacts.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Reads the CLI's own package.json (walking up from __dirname) to report its own version -
      // never the project's, and never the running machine's environment either.
      files: ['packages/cli/src/commands/test/bundleSidecar.ts'],
      rules: {
        'no-restricted-syntax': ['error', ...NODE_CORE_DOOR_SYNTAX],
      },
    },
  ],
};
