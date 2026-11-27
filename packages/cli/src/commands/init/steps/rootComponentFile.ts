/**
 * WHERE THE APP'S ROOT COMPONENT IS, so the in-app way of the next steps names the file the app has
 * and the import path to the Storybook folder is true from it.
 *
 * An expo-router app's root component is the `_layout` file of the router's folder. The folder is
 * found the way the Expo CLI finds it (@expo/cli build/src/start/server/metro/router.js,
 * getRouterDirectoryModuleIdWithManifest): the `root` the app config gives expo-router (its plugin
 * option, which expo-router's withRouter copies into `extra.router`), else `src/app` when it exists,
 * else `app`. An app without expo-router keeps it in `App` at its root or under `src/`.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { readProjectJson } from '../../../helpers/projectJson';
import type { RootComponentFile } from '../../../render/initSteps';

/** In the order tried: the first is the most common, named when none exists. */
const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * The router's folder as app.json gives it, else the Expo CLI's default.
 * BUILD DEBT (init-for-agents): an app.config.js or app.config.ts is not run, so a `root` set only
 * there is not seen and the default is used.
 */
function expoRouterFolder(projectRoot: string): string {
  const expoConfig = readProjectJson(projectRoot, 'app.json')?.expo;
  const pluginOptions = (expoConfig?.plugins ?? []).find(
    (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-router'
  )?.[1];
  const configuredRoot: unknown = pluginOptions?.root ?? expoConfig?.extra?.router?.root;
  if (typeof configuredRoot === 'string') return path.posix.normalize(configuredRoot);

  return fs.existsSync(path.join(projectRoot, 'src', 'app')) ? 'src/app' : 'app';
}

function rootComponentFile(hasExpoRouter: boolean): RootComponentFile {
  const projectRoot = getCwd();
  const baseNames = hasExpoRouter
    ? // Joined, never glued: a root written 'app/' or './app' still names app/_layout.
      [path.posix.join(expoRouterFolder(projectRoot), '_layout')]
    : ['App', 'src/App'];
  const candidates = baseNames.flatMap((baseName) =>
    SCRIPT_EXTENSIONS.map((extension) => `${baseName}${extension}`)
  );
  const foundFile = candidates.find((file) => fs.existsSync(path.join(projectRoot, file)));

  return foundFile
    ? {
        file: foundFile,
        found: true,
        defaultExport: readDefaultExport(path.join(projectRoot, foundFile)),
      }
    : { file: candidates[0], found: false, defaultExport: null };
}

/**
 * The name an unnamed root component is given, the first the file does not use already: a name the
 * file imports or declares would clash with it.
 */
const NAMES_FOR_UNNAMED = ['App', 'Root', 'MainApp'];

/**
 * How the root file exports its component, read off its lines: `export default function App(` or
 * `export default class App` declares it; `export default App;` names one declared above;
 * `export default Sentry.wrap(App);` (or `codePush(options)(App)`) wraps one in a call, which the
 * change keeps around the switch; `export default () =>` (or `export default function (`) is
 * unnamed, and the change names it, so the switch can render it. Any other form (wrappers nested
 * around it, a call with more arguments) is null: the next step then gives the generic change,
 * never a guessed one.
 *
 * A NAME IS A COMPONENT'S ONLY WHEN IT STARTS WITH A CAPITAL: JSX reads `<app />` as the built-in
 * tag `app`, so an export of a lowercase name gets the generic change too.
 */
function readDefaultExport(file: string): RootComponentFile['defaultExport'] {
  let code: string;
  try {
    code = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const declared = /^export default (?:async )?(?:function|class) ([A-Z][\w$]*)\b.*$/m.exec(code);
  if (declared) {
    const line = declared[0].trim();
    return {
      form: 'declared',
      line,
      rewritten: line.replace(/^export default /, ''),
      name: declared[1],
    };
  }
  const named = /^export default ([A-Z][\w$]*);?[ \t]*$/m.exec(code);
  if (named) {
    // STORYBOOK'S OLD SWITCH, as its docs gave it before 10: `let AppEntryPoint = App;`, then an
    // `if` that sets it to the Storybook folder's export. The export names the switch, not the
    // app, so the change removes the switch and renders the app it held.
    const switchName = named[1].replace(/\$/g, '\\$');
    const oldSwitch = new RegExp(
      `^let ${switchName} = ([A-Z][\\w$]*);[ \\t]*\\n(?:[ \\t]*\\n)*` +
        `if \\(.*\\) \\{[ \\t]*\\n[ \\t]*${switchName} = require\\(['"][^'"]+['"]\\)\\.default;[ \\t]*\\n\\}[ \\t]*$`,
      'm'
    ).exec(code);
    if (oldSwitch) {
      return {
        form: 'switched',
        line: named[0].trim(),
        name: oldSwitch[1],
        switchCode: oldSwitch[0].split('\n').filter((line) => line.trim() !== ''),
      };
    }
    return { form: 'named', line: named[0].trim(), name: named[1] };
  }
  const wrapped = /^export default (.+)\(([A-Z][\w$]*)\);?[ \t]*$/m.exec(code);
  if (wrapped) {
    return { form: 'wrapped', line: wrapped[0].trim(), name: wrapped[2], call: wrapped[1] };
  }

  const arrow = /^export default ((?:async )?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/m.exec(code);
  const anonymousFunction = /^export default ((?:async )?function)\s*(\()/m.exec(code);
  const name = NAMES_FOR_UNNAMED.find((candidate) => !new RegExp(`\\b${candidate}\\b`).test(code));
  if (!name) return null;
  if (arrow) {
    return {
      form: 'declared',
      line: arrow[0],
      rewritten: `const ${name} = ${arrow[1]}`,
      name,
    };
  }
  if (anonymousFunction) {
    return {
      form: 'declared',
      line: anonymousFunction[0],
      rewritten: `${anonymousFunction[1]} ${name}(`,
      name,
    };
  }
  return null;
}

export default rootComponentFile;
