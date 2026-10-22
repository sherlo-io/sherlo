/**
 * THE COVERAGE SCAN SEAM - the one road `sherlo coverage` reads the app down.
 *
 *     live   - the app's own source files, read from the project folder and handed to
 *              ../commands/coverage/componentGaps (which components exist, which files import
 *              them, which story files import which). With `--props` it also opens the app's own
 *              TypeScript program, from the app's own `typescript` package and tsconfig.json, and
 *              hands its answers to ../commands/coverage/storyPropValues.
 *     posed  - the pose's `coverage`: what the scan found.
 *
 * A SEAM OF ITS OWN, NOT THE CAPTURE SOCKET. A capture is one story's record; this is the whole
 * app read at once, and none of it needs a phone or a bundler.
 *
 * THE APP'S TYPESCRIPT, NEVER THE TOOL'S. The types are read with the compiler the app itself
 * builds with, so the allowed values are the ones its own checker sees. TypeScript 7 answers
 * through its `unstable/sync` API (a tsgo process); an older one through its classic compiler API.
 */
import fg from 'fast-glob';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type * as NativeAst from 'typescript/unstable/ast';
import type { FileSystem } from 'typescript/unstable/fs';
import type * as NativeTypeScript from 'typescript/unstable/sync';
import { pathToFileURL } from 'url';
import { componentGaps, rankGaps } from '../commands/coverage/componentGaps';
import {
  componentTypesFrom,
  literalValue,
  storyPropValues,
} from '../commands/coverage/storyPropValues';
import type {
  ComponentTypes,
  TypeNodeShape,
  TypeReader,
} from '../commands/coverage/storyPropValues';
import throwError from '../helpers/throwError';
import type { CoverageFindings } from '../render/coverage';
import { projectFiles } from './projectFiles';

/** Everything the tool asks of the app's files down this road, and nothing else. */
export type CoverageScan = {
  scan(params: { withProps: boolean }): Promise<CoverageFindings>;
};

/** Folders that hold no source of the app. Dot folders are skipped by the glob itself. */
const NOT_THE_APP = ['**/node_modules/**', '**/build/**', '**/dist/**', '**/Pods/**'];

const NO_APP_TYPESCRIPT =
  "`--props` needs the app's TypeScript: no `typescript` package or tsconfig.json was found in the project folder.";

/** The shipped answer: read the app's source files from the project folder and list the gaps. */
export const liveCoverageScan: CoverageScan = {
  scan: async ({ withProps }) => {
    const root = projectFiles().root();
    const paths = await fg('**/*.{ts,tsx,js,jsx}', { cwd: root, ignore: NOT_THE_APP, dot: false });
    const files = paths.sort().map((file) => ({
      path: file,
      text: fs.readFileSync(path.join(root, file), 'utf8'),
    }));
    const tsconfigPath = path.join(root, 'tsconfig.json');
    const tsconfig = fs.existsSync(tsconfigPath)
      ? fs.readFileSync(tsconfigPath, 'utf8')
      : undefined;

    const findings = componentGaps({ files, tsconfig });
    if (!withProps) return findings;

    const types = await openAppTypes(root);
    try {
      return { ...findings, props: storyPropValues({ files, types }) };
    } finally {
      types.close();
    }
  },
};

let installed: CoverageScan = liveCoverageScan;

/** The coverage scan in force. */
export function coverageScan(): CoverageScan {
  return installed;
}

/** Install a coverage scan for the duration of one posed run; the returned function undoes it. */
export function installCoverageScan(next: CoverageScan): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The app's TypeScript                                                       */
/* ========================================================================== */

/** The app's types, read from its own TypeScript program, open until `close`. */
export type OpenComponentTypes = ComponentTypes & { close(): void };

/** The app's own `typescript`, resolved from the project folder, opened on its tsconfig.json. */
async function openAppTypes(root: string): Promise<OpenComponentTypes> {
  const fromApp = createRequire(path.join(root, 'package.json'));
  let manifest: string | undefined;
  try {
    manifest = fromApp.resolve('typescript/package.json');
  } catch {
    // An app with no `typescript` package gets the refusal below.
    manifest = undefined;
  }
  if (!manifest || !fs.existsSync(path.join(root, 'tsconfig.json'))) {
    throwError({ message: NO_APP_TYPESCRIPT });
  }

  const { version } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version: string };
  if (Number(version.split('.')[0]) >= 7) {
    const native: typeof NativeTypeScript = await import(
      pathToFileURL(fromApp.resolve('typescript/unstable/sync')).href
    );
    return nativeComponentTypes(native, { root });
  }
  return classicComponentTypes(fromApp('typescript') as ClassicTypeScript, { root });
}

/** The app's types through TypeScript 7's API; `fs` hands it an app held in memory instead of disk. */
export function nativeComponentTypes(
  typescript: typeof NativeTypeScript,
  params: { root: string; fs?: FileSystem }
): OpenComponentTypes {
  const { SignatureKind, SymbolFlags, TypeFlags } = typescript;
  const api = new typescript.API({ cwd: params.root, ...(params.fs && { fs: params.fs }) });
  let project: NativeTypeScript.Project | undefined;
  try {
    const snapshot = api.updateSnapshot({
      openProjects: [path.join(params.root, 'tsconfig.json')],
    });
    project = snapshot.getProjects()[0];
  } finally {
    if (!project) api.close();
  }
  if (!project) throwError({ message: NO_APP_TYPESCRIPT });

  const { checker, program } = project;
  // A declaration comes back under its canonical path, lower case on a case-blind disk.
  const fileNames = new Map<string, string>();
  for (const name of program.getSourceFileNames()) {
    fileNames.set(name, name);
    fileNames.set(name.toLowerCase(), name);
  }

  const followAlias = (symbol: NativeTypeScript.Symbol | undefined) =>
    symbol && symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaredType = (symbol: NativeTypeScript.Symbol | undefined) =>
    (symbol?.declarations[0]?.resolve() as TypeNodeShape | undefined)?.type;
  const literalsOf = (of: NativeTypeScript.Type | undefined) => {
    const type = of && checker.getNonNullableType(of);
    if (!type) return [undefined];
    const parts =
      type.flags & TypeFlags.Union ? (type as NativeTypeScript.UnionType).getTypes() : [type];
    return parts.map((part) => literalValue(part, TypeFlags));
  };

  const reader: TypeReader<NativeTypeScript.Symbol> = {
    symbolAt: (file, position) => followAlias(checker.getSymbolAtPosition(file, position)),
    name: (symbol) => symbol.name,
    declaredIn: (symbol) =>
      symbol.declarations.map((node) => fileNames.get(node.path) ?? node.path),
    propsOf: (component) => {
      const type = checker.getTypeOfSymbol(component);
      const [signature] = type ? checker.getSignaturesOfType(type, SignatureKind.Call) : [];
      const propsType = signature && checker.getParameterType(signature, 0);
      return propsType ? checker.getPropertiesOfType(propsType) : [];
    },
    valuesOf: (prop) => literalsOf(checker.getTypeOfSymbol(prop)),
    typeNodeOf: (prop) => declaredType(prop),
    aliasedTypeNode: (reference) =>
      declaredType(followAlias(checker.getSymbolAtLocation(reference.typeName as NativeAst.Node))),
    nodeValuesOf: (node) =>
      literalsOf(checker.getTypeFromTypeNode(node as unknown as NativeAst.TypeNode)),
  };
  return { ...componentTypesFrom(reader, params.root), close: () => api.close() };
}

/** A node of the classic compiler API, as far as this seam reads one. */
type ClassicNode = TypeNodeShape & {
  pos: number;
  end: number;
  getStart(): number;
  getSourceFile(): { fileName: string };
};
type ClassicSymbol = {
  name: string;
  flags: number;
  declarations?: ClassicNode[];
  valueDeclaration?: ClassicNode;
};
type ClassicType = {
  flags: number;
  value?: unknown;
  intrinsicName?: string;
  types?: ClassicType[];
  getCallSignatures(): { getParameters(): ClassicSymbol[] }[];
};
type ClassicProgram = {
  getSourceFile(file: string): ClassicNode | undefined;
  getTypeChecker(): {
    getSymbolAtLocation(node: ClassicNode): ClassicSymbol | undefined;
    getAliasedSymbol(symbol: ClassicSymbol): ClassicSymbol;
    getTypeOfSymbolAtLocation(symbol: ClassicSymbol, node: ClassicNode): ClassicType;
    getPropertiesOfType(type: ClassicType): ClassicSymbol[];
    getNonNullableType(type: ClassicType): ClassicType;
    getTypeFromTypeNode(node: TypeNodeShape): ClassicType;
  };
};
/** What this seam asks of a TypeScript older than 7: its classic compiler API. */
type ClassicTypeScript = {
  sys: { readFile(file: string): string | undefined };
  readConfigFile(file: string, read: (file: string) => string | undefined): { config?: unknown };
  parseJsonConfigFileContent(
    config: unknown,
    host: unknown,
    base: string
  ): { fileNames: string[]; options: unknown };
  createProgram(
    files: string[],
    options: unknown,
    host?: undefined,
    oldProgram?: ClassicProgram
  ): ClassicProgram;
  forEachChild<T>(node: ClassicNode, visit: (child: ClassicNode) => T | undefined): T | undefined;
  isIdentifier(node: ClassicNode): boolean;
  SymbolFlags: { Alias: number };
  TypeFlags: {
    StringLiteral: number;
    NumberLiteral: number;
    BooleanLiteral: number;
    Union: number;
  };
};

/** The app's types through the classic compiler API of a TypeScript older than 7. */
export function classicComponentTypes(
  typescript: ClassicTypeScript,
  params: { root: string }
): OpenComponentTypes {
  const { root } = params;
  const tsconfig = path.join(root, 'tsconfig.json');
  const { config } = typescript.readConfigFile(tsconfig, typescript.sys.readFile);
  const parsed = typescript.parseJsonConfigFileContent(config, typescript.sys, root);
  const roots = [...parsed.fileNames];
  let program = typescript.createProgram(roots, parsed.options);
  let checker = program.getTypeChecker();
  const declarationOf = (symbol: ClassicSymbol) =>
    symbol.valueDeclaration ?? symbol.declarations?.[0];

  function identifierAt(node: ClassicNode, position: number): ClassicNode | undefined {
    if (typescript.isIdentifier(node) && node.getStart() === position) return node;
    return typescript.forEachChild(node, (child) =>
      child.pos <= position && position < child.end ? identifierAt(child, position) : undefined
    );
  }

  const followAlias = (symbol: ClassicSymbol | undefined) =>
    symbol && symbol.flags & typescript.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const literalsOf = (of: ClassicType) => {
    const type = checker.getNonNullableType(of);
    const parts = type.flags & typescript.TypeFlags.Union ? (type.types ?? []) : [type];
    return parts.map((part) => literalValue(part, typescript.TypeFlags));
  };

  const reader: TypeReader<ClassicSymbol> = {
    symbolAt: (file, position) => {
      // A tsconfig.json may leave story files out (an `exclude`, a narrow `include`, a solution
      // `files: []`): the program then has no such file, so it is added as a root of its own.
      if (!program.getSourceFile(file)) {
        roots.push(file);
        program = typescript.createProgram(roots, parsed.options, undefined, program);
        checker = program.getTypeChecker();
      }
      const source = program.getSourceFile(file);
      const node = source && identifierAt(source, position);
      return followAlias(node && checker.getSymbolAtLocation(node));
    },
    name: (symbol) => symbol.name,
    declaredIn: (symbol) =>
      (symbol.declarations ?? []).map((node) => path.resolve(node.getSourceFile().fileName)),
    propsOf: (component) => {
      const declaration = declarationOf(component);
      if (!declaration) return [];
      const type = checker.getTypeOfSymbolAtLocation(component, declaration);
      const [parameter] = type.getCallSignatures()[0]?.getParameters() ?? [];
      const at = parameter && (declarationOf(parameter) ?? declaration);
      return parameter && at
        ? checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(parameter, at))
        : [];
    },
    valuesOf: (prop) => {
      const declaration = declarationOf(prop);
      return declaration
        ? literalsOf(checker.getTypeOfSymbolAtLocation(prop, declaration))
        : [undefined];
    },
    typeNodeOf: (prop) => declarationOf(prop)?.type,
    aliasedTypeNode: (reference) => {
      const symbol = followAlias(checker.getSymbolAtLocation(reference.typeName as ClassicNode));
      return symbol && declarationOf(symbol)?.type;
    },
    nodeValuesOf: (node) => literalsOf(checker.getTypeFromTypeNode(node)),
  };
  return { ...componentTypesFrom(reader, root), close: () => undefined };
}

/* ========================================================================== */
/* The posed coverage scan                                                    */
/* ========================================================================== */

/**
 * What the scan found, as a pose states it.
 *
 * As with the capture socket, a pose never supplies the words the screen shows: it states the
 * findings, and the tool prints whatever it prints for them.
 */
export type PosedCoverage = {
  /** How many components the app has. */
  components: number;
  /** The components no story file imports directly, in any order: the scan ranks them. */
  gaps: CoverageFindings['gaps'];
  /** What reading the story files found. Stated only when the pose runs `--props`. */
  props?: CoverageFindings['props'];
};

/**
 * The coverage scan a pose declares.
 *
 * A pose with no `coverage` running `sherlo coverage` is refused and RECORDED, the way the capture
 * socket records an unscripted ask: throwing would replace the screen the pose exists to show.
 */
export function posedCoverageScan(
  posed: PosedCoverage | undefined
): CoverageScan & { refusals(): { call: string; problem: string }[] } {
  const refusals: { call: string; problem: string }[] = [];

  function refuse(problem: string): CoverageFindings {
    refusals.push({ call: 'scan', problem });
    return { components: 0, gaps: [] };
  }

  return {
    refusals: () => refusals,

    scan: async ({ withProps }) => {
      if (!posed) {
        return refuse(
          'the pose states no `coverage`, and the command asked - say what the scan found'
        );
      }

      if (withProps && !posed.props) {
        return refuse('the command asked for `--props`, and the pose states no `coverage.props`');
      }

      // A pose states its gaps in any order; the live scan has them ranked by componentGaps.
      const { props, ...findings } = posed;
      return rankGaps({ ...findings, ...(withProps && { props }) });
    },
  };
}
