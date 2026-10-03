/**
 * WRITE THE POSE CONTRACT AND ITS READER FROM THE SEAMS' OWN TYPES.
 *
 *     yarn generate:pose-contract    write both files
 *     yarn check:pose-contract       hold both against what is committed - what CI runs
 *
 * A pose states what each seam answered, so the shape of an answer belongs to the seam that
 * answers it: `src/seams/*.ts` declare the posed types and `src/seams/commandPose.ts` composes
 * them into `CommandPose`. This script reads that one declaration through the TypeScript checker
 * and writes the two copies of it nobody should ever type again:
 *
 *     contracts/pose.contract.ts                    {@link writePoseContract}
 *     src/commands/pose/readPose.generated.ts       {@link writeReadPoseGenerated}
 *
 * The contract is written out to primitives and string literals with NO import, because a
 * consumer copies it verbatim into a repository that cannot resolve one. The reader is the shape
 * half of `readPose.ts`: required fields, unknown keys, wrong types, every problem named in one
 * message. The wording of every refusal lives by hand in `src/commands/pose/poseProblems.ts` -
 * this script only decides which check runs where.
 *
 * WHAT THIS SCRIPT CANNOT DERIVE stays hand-written in `readPose.ts`: which commands bundle,
 * which act on the machine, which platform names a map may use, and what counts as an instant.
 * Those are meanings, not shapes, and a type says nothing about them.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import prettier from 'prettier';
import ts from 'typescript';

const CLI_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const SEAMS_DIR = path.join(CLI_ROOT, 'src', 'seams');
const CONTRACT_FILE = path.join(REPO_ROOT, 'contracts', 'pose.contract.ts');
const READER_FILE = path.join(CLI_ROOT, 'src', 'commands', 'pose', 'readPose.generated.ts');

/** The seam module that composes the root type, and the root type it composes. */
const COMPOSING_MODULE = 'commandPose.ts';
const ROOT_TYPE = 'CommandPose';

/* ========================================================================== */
/* The shape a posed type has, once the checker has been asked what it is.    */
/* ========================================================================== */

type Shape =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'unknown' }
  | { kind: 'never' }
  | { kind: 'null' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'array'; of: Shape }
  | { kind: 'map'; of: Shape }
  | { kind: 'object'; fields: Field[] }
  | { kind: 'named'; name: string }
  | { kind: 'union'; of: Shape[] };

type Field = { name: string; optional: boolean; doc: string; shape: Shape };

/** One posed type as the contract publishes it: its name, its prose, and what it is made of. */
type NamedShape = { name: string; doc: string; shape: Shape };

/* ========================================================================== */

function main(): void {
  const checking = process.argv.includes('--check');
  const published = readSeamTypes();
  for (const type of published) publishedBodies.set(type.name, type.shape);

  const contract = writePoseContract(published);
  const reader = writeReadPoseGenerated(published);

  if (!checking) {
    fs.writeFileSync(CONTRACT_FILE, contract);
    fs.writeFileSync(READER_FILE, reader);
    console.log(`wrote ${relative(CONTRACT_FILE)}\nwrote ${relative(READER_FILE)}`);
    return;
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-contract-'));
  const stale = [
    [CONTRACT_FILE, contract],
    [READER_FILE, reader],
  ]
    .filter(([file, fresh]) => readOrEmpty(file) !== fresh)
    .map(([file, fresh]) => {
      const freshCopy = path.join(scratch, path.basename(file));
      fs.writeFileSync(freshCopy, fresh);
      return `  - ${relative(file)}\n    diff it against ${freshCopy}`;
    });

  if (stale.length === 0) {
    fs.rmSync(scratch, { recursive: true, force: true });
    console.log('the pose contract and its reader are what the seam types say they are');
    return;
  }

  console.error(
    'The pose contract and its reader are GENERATED from the seam types, and these no longer ' +
      'match what `src/seams/commandPose.ts` says:\n' +
      stale.join('\n') +
      '\n\nA hand edit to either is the usual cause. Change the seam type instead, then run ' +
      '`yarn generate:pose-contract` from packages/cli and commit both files.'
  );
  process.exitCode = 1;
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file);
}

function readOrEmpty(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/* ========================================================================== */
/* Reading the seams                                                          */
/* ========================================================================== */

/**
 * Every posed type the contract publishes, root first, then each type the root leads to.
 *
 * A type alias EXPORTED BY A SEAM keeps its name; anything else a posed type reaches - the wire's
 * own `BuildStatus`, say - is written out where it is used, because a consumer copying the
 * contract has no import to resolve it with.
 */
function readSeamTypes(): NamedShape[] {
  const config = ts.readConfigFile(path.join(CLI_ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, CLI_ROOT);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  const nameOfType = new Map<ts.Type, string>();
  const typeOfName = new Map<string, ts.Type>();
  const docOfName = new Map<string, string>();

  for (const file of seamModulesInOrder()) {
    const source = program.getSourceFile(path.join(SEAMS_DIR, file));
    if (!source) throw new Error(`the seam ${file} is not in the program`);

    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;

    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const declaration = exported.declarations?.[0];
      if (!declaration || !ts.isTypeAliasDeclaration(declaration)) continue;
      if (typeOfName.has(exported.name)) continue;

      const type = checker.getDeclaredTypeOfSymbol(exported);
      typeOfName.set(exported.name, type);
      docOfName.set(exported.name, documentationOf(exported, checker));
      if (!nameOfType.has(type)) nameOfType.set(type, exported.name);
    }
  }

  const rootType = typeOfName.get(ROOT_TYPE);
  if (!rootType) throw new Error(`${COMPOSING_MODULE} exports no ${ROOT_TYPE}`);

  const published: NamedShape[] = [];
  const queue = [ROOT_TYPE];
  const queued = new Set(queue);

  while (queue.length > 0) {
    const name = queue.shift() as string;
    const type = typeOfName.get(name) as ts.Type;
    const shape = shapeOf(type, checker, nameOfType, true, (reference) => {
      if (queued.has(reference)) return;
      queued.add(reference);
      queue.push(reference);
    });

    published.push({ name, doc: docOfName.get(name) ?? '', shape });
  }

  return published;
}

/** The composing module first, so the root type wins any tie, then the seams by name. */
function seamModulesInOrder(): string[] {
  const seams = fs
    .readdirSync(SEAMS_DIR)
    .filter((file) => file.endsWith('.ts') && file !== COMPOSING_MODULE)
    .sort();

  return [COMPOSING_MODULE, ...seams];
}

function documentationOf(symbol: ts.Symbol, checker: ts.TypeChecker): string {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
}

/**
 * What one type is made of.
 *
 * `atRootOfNamedType` is what stops a published type from being written as a reference to itself:
 * its own body is expanded once, and every OTHER mention of it anywhere becomes the name.
 */
function shapeOf(
  type: ts.Type,
  checker: ts.TypeChecker,
  nameOfType: Map<ts.Type, string>,
  atRootOfNamedType: boolean,
  publish: (name: string) => void
): Shape {
  const recur = (next: ts.Type) => shapeOf(next, checker, nameOfType, false, publish);

  if (!atRootOfNamedType) {
    const name = nameOfType.get(type);
    if (name) {
      publish(name);
      return { kind: 'named', name };
    }
  }

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return { kind: 'unknown' };
  if (type.flags & ts.TypeFlags.Never) return { kind: 'never' };
  if (type.flags & ts.TypeFlags.Null) return { kind: 'null' };
  if (type.flags & ts.TypeFlags.Boolean) return { kind: 'boolean' };
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return { kind: 'literal', value: checker.typeToString(type) === 'true' };
  }
  if (type.isStringLiteral()) return { kind: 'literal', value: type.value };
  if (type.isNumberLiteral()) return { kind: 'literal', value: type.value };
  if (type.flags & ts.TypeFlags.String) return { kind: 'string' };
  if (type.flags & ts.TypeFlags.Number) return { kind: 'number' };

  if (type.isUnion()) {
    const members = settledOrder(
      collapseBooleans(
        type.types.filter((member) => (member.flags & ts.TypeFlags.Undefined) === 0).map(recur)
      )
    );

    return members.length === 1 ? members[0] : { kind: 'union', of: members };
  }

  if (checker.isArrayType(type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    return { kind: 'array', of: recur(element) };
  }

  const properties = type.getProperties();
  const entryType = type.getStringIndexType();
  if (properties.length === 0 && entryType) return { kind: 'map', of: recur(entryType) };

  return {
    kind: 'object',
    fields: properties.map((property) => fieldOf(property, checker, recur)),
  };
}

/**
 * `true` and `false` side by side are `boolean` again.
 *
 * TypeScript flattens `boolean` into its two literals the moment it joins a union - which is what
 * an optional field is - so a pose stating `hasNetworkImage: true` would otherwise be published as
 * `false | true` and read as two branches nobody wrote.
 */
function collapseBooleans(members: Shape[]): Shape[] {
  const isLiteral = (member: Shape, value: boolean) =>
    member.kind === 'literal' && member.value === value;

  if (!members.some((member) => isLiteral(member, true))) return members;
  if (!members.some((member) => isLiteral(member, false))) return members;

  const rest = members.filter(
    (member) => !isLiteral(member, true) && !isLiteral(member, false)
  );

  return [...rest, { kind: 'boolean' }];
}

/**
 * The order a union reads best in: the words it could be, then the shapes, then `null` last.
 *
 * TypeScript hands back its own internal order, which puts `null` first and sorts the rest by an
 * id nobody can see. A published contract is read by people, and a generated file that reshuffled
 * itself when an unrelated type was declared would diff for no reason.
 */
function settledOrder(members: Shape[]): Shape[] {
  const rank = (member: Shape) => {
    if (member.kind === 'literal') return 0;
    if (member.kind === 'null') return 2;
    return 1;
  };

  return members.map((member, index) => ({ member, index })).sort(
    (one, other) => rank(one.member) - rank(other.member) || one.index - other.index
  ).map((one) => one.member);
}

function fieldOf(
  property: ts.Symbol,
  checker: ts.TypeChecker,
  recur: (type: ts.Type) => Shape
): Field {
  const declaration = property.declarations?.[0];
  if (!declaration) throw new Error(`\`${property.name}\` has no declaration to read`);

  // READ THE TYPE THE FIELD WAS WRITTEN WITH, not the type the field HAS: an optional field has
  // `| undefined` on it, and TypeScript flattens that into the union it was already made of - so
  // `capture?: PosedCapture` would come back as PosedCapture's four branches with the name it was
  // written under gone, and the contract would write the shape out again instead of naming it.
  const written =
    ts.isPropertySignature(declaration) && declaration.type
      ? checker.getTypeFromTypeNode(declaration.type)
      : checker.getTypeOfSymbolAtLocation(property, declaration);

  return {
    name: property.name,
    optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
    doc: documentationOf(property, checker),
    shape: recur(written),
  };
}

/* ========================================================================== */
/* contracts/pose.contract.ts                                                 */
/* ========================================================================== */

/** The contract a consumer copies: every posed type written out, with no import to resolve. */
function writePoseContract(published: NamedShape[]): string {
  const header = `// GENERATED from the seam types in packages/cli/src/seams by \`yarn generate:pose-contract\` - do not edit.
/**
 * THE COMMAND POSE CONTRACT - what a caller declares to make a Sherlo command-line tool print one
 * of its own screens, without a project, a token or a network.
 *
 * \`sherlo pose <pose.json|->\` runs ONE command the way a user would and prints the whole screen:
 * both streams in the order they were written, then the exit code the real run would have had.
 * The command's code is the shipped code, untouched. What the pose replaces is the seams the
 * command reaches the world through, and each field below is one seam's answer.
 *
 * A POSE SAYS INPUTS AND ANSWERS, NEVER WORDS. It cannot supply a sentence, a colour or a line of
 * output; the screen is the output. That is what makes a rendered transcript evidence about the
 * tool and not about the caller who posed it.
 *
 * ------------------------------------------------------------------------
 * WHY THIS FILE HAS NO IMPORTS, AND MAY NEVER GROW ONE.
 *
 * A consumer copies this file - sherlo-tester today, sherlo-api's admin tool next - verbatim, into
 * a repository with no access to this one's internals. An import would make the copy unresolvable
 * the moment it landed, so every type is written out to primitives and string literals, and a
 * consumer's sync refuses a copy that contains an import at all.
 *
 * IT CANNOT DRIFT FROM THE TOOL, because nobody writes it: it is generated from the types the
 * seams themselves declare, and \`yarn check:pose-contract\` reds a pull request that edits it by
 * hand. ./pose.contract.law.ts asserts it against those same types in both directions as well, so
 * a copy that was never regenerated fails to compile rather than reading plausibly.
 *
 * ------------------------------------------------------------------------
 * WHAT IS REFUSED, AND WHY NOTHING IS GUESSED.
 *
 * Every field below is required save the four a single road reaches. A missing field, an unknown
 * key or a value of the wrong type is refused, and the refusal names EVERY problem in one message,
 * so a hand-written pose is fixed in one pass. A default that quietly filled a gap would let
 * somebody review a state they never asked for. And a call the command makes that the pose did not
 * script is refused too, with the screen so far printed under the refusal: a pose can never pass
 * on a road it did not describe.
 */
`;

  const types = published.map(
    (type) => `${docBlock(type.doc, 0)}export type ${type.name} = ${typeText(type.shape, 0)};`
  );

  return format(`${header}\n${types.join('\n\n')}\n`, CONTRACT_FILE);
}

/** One type as TypeScript source, with the prose each field carries. */
function typeText(shape: Shape, depth: number): string {
  switch (shape.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'unknown':
    case 'never':
      return shape.kind;
    case 'null':
      return 'null';
    case 'literal':
      return literalText(shape.value);
    case 'named':
      return shape.name;
    case 'map':
      return `Record<string, ${typeText(shape.of, depth)}>`;
    case 'array':
      return shape.of.kind === 'object' || shape.of.kind === 'union'
        ? `Array<${typeText(shape.of, depth)}>`
        : `${typeText(shape.of, depth)}[]`;
    case 'union':
      return shape.of.map((member) => typeText(member, depth)).join(' | ');
    case 'object': {
      const fields = shape.fields.map(
        (field) =>
          `${docBlock(field.doc, depth + 1)}${field.name}${field.optional ? '?' : ''}: ` +
          `${typeText(field.shape, depth + 1)};`
      );
      return `{\n${fields.join('\n')}\n}`;
    }
  }
}

function literalText(value: string | number | boolean): string {
  return typeof value === 'string' ? `'${value}'` : String(value);
}

/** A field's prose, wrapped to the width it will have once prettier has indented it. */
function docBlock(doc: string, depth: number): string {
  if (doc === '') return '';

  const width = Math.max(40, 96 - depth * 2);
  const lines = paragraphsOf(doc).flatMap((paragraph, index) => [
    ...(index === 0 ? [] : ['']),
    ...(paragraph.laidOut ? paragraph.lines : wrap(paragraph.lines.join(' '), width)),
  ]);

  if (lines.length === 1) return `/** ${lines[0]} */\n`;

  return `/**\n${lines.map((line) => (line === '' ? ' *' : ` * ${line}`)).join('\n')}\n */\n`;
}

/**
 * A doc arrives wrapped to whatever width its own source file used, which is not the width it
 * will have once it is nested inside the contract. Paragraphs are re-wrapped; a block any of whose
 * lines is indented was laid out on purpose and is left exactly as it was written.
 */
function paragraphsOf(doc: string): Array<{ laidOut: boolean; lines: string[] }> {
  return doc.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    return { laidOut: lines.some((line) => /^\s+\S/.test(line)), lines };
  });
}

function wrap(paragraph: string, width: number): string[] {
  const words = paragraph.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line === '') line = word;
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);

  return lines;
}

/* ========================================================================== */
/* src/commands/pose/readPose.generated.ts                                    */
/* ========================================================================== */

/** The shape half of the reader: one function per posed type, refusing in one pass. */
function writeReadPoseGenerated(published: NamedShape[]): string {
  const readers = published.map((type) => readerFunction(type)).join('\n\n');

  const file = `// GENERATED from the seam types in packages/cli/src/seams by \`yarn generate:pose-contract\` - do not edit.
/**
 * THE SHAPE HALF OF THE POSE READER - required fields, unknown keys, wrong types, every problem
 * named in one message.
 *
 * ./readPose calls this first and then adds the checks a type cannot state: which commands bundle,
 * which act on the machine, which platform names a map may use, and what counts as an instant. The
 * wording of every refusal is by hand in ./poseProblems; only the walk below is written by a
 * program - \`packages/cli/scripts/generate-pose-contract.ts\`, from \`src/seams/commandPose.ts\`.
 *
 * Nothing here throws: a check appends its sentence and the walk carries on, so a hand-written
 * pose with four mistakes in it is refused once, naming all four.
 */
import { ${helpersUsedIn(readers).join(', ')} } from './poseProblems';

/** Read the shape of a whole pose, appending one sentence per problem found. */
export function readPoseShape(document: unknown, problems: string[]): void {
  read${ROOT_TYPE}(document, '', problems);
}

${readers}
`;

  return format(file, READER_FILE);
}

/**
 * The checks this generation actually reached for.
 *
 * Importing the whole of ./poseProblems would leave an unused import the moment a posed type
 * stopped using one - and an unused import is a lint error, so the generated file would red a
 * pull request for a change nobody made.
 */
function helpersUsedIn(readers: string): string[] {
  const helpers = [
    'asArray',
    'asObject',
    'at',
    'atIndex',
    'atKey',
    'expectBoolean',
    'expectLiteral',
    'expectNumber',
    'expectOneOf',
    'expectString',
    'expectStringArray',
    'isPlainObject',
    'reportUnknownFields',
    'reportUnknownName',
    'reportWrongShape',
  ];

  return helpers.filter((helper) => new RegExp(`\\b${helper}\\(`).test(readers));
}

function readerFunction(type: NamedShape): string {
  const body = emitCheck(type.shape, 'value', 'path', freshNames());

  return (
    `/** The shape of a \`${type.name}\`, as \`contracts/pose.contract.ts\` publishes it. */\n` +
    `function read${type.name}(value: unknown, path: string, problems: string[]): void {\n` +
    `${body.join('\n')}\n}`
  );
}

/** Local variable names that cannot collide, however deep the walk nests. */
function freshNames(): (stem: string) => string {
  let taken = 0;
  return (stem) => `${stem}${++taken}`;
}

/**
 * The checks one shape needs, as lines of TypeScript.
 *
 * `value` and `path` are EXPRESSIONS in the generated code - `object2.tree`, `at(path, 'tree')` -
 * so a check reads the value it is about and names the place it came from without either being
 * threaded through a variable nobody can follow.
 */
function emitCheck(
  shape: Shape,
  value: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  switch (shape.kind) {
    case 'unknown':
    case 'never':
      return [];
    case 'string':
      return [`expectString(${value}, ${path}, problems);`];
    case 'number':
      return [`expectNumber(${value}, ${path}, problems);`];
    case 'boolean':
      return [`expectBoolean(${value}, ${path}, problems);`];
    case 'null':
      return [
        `if (${value} !== null) {`,
        `reportWrongShape(${value}, '\`null\`', ${path}, problems);`,
        '}',
      ];
    case 'literal':
      return [`expectLiteral(${value}, ${literalText(shape.value)}, ${path}, problems);`];
    case 'named':
      return [`read${shape.name}(${value}, ${path}, problems);`];
    case 'array':
      return emitArrayCheck(shape.of, value, path, fresh);
    case 'map':
      return emitMapCheck(shape.of, value, path, fresh);
    case 'object':
      return emitObjectCheck(shape.fields, value, path, fresh);
    case 'union':
      return emitUnionCheck(shape.of, value, path, fresh);
  }
}

/**
 * A container names the place it is at before walking into it.
 *
 * Without this every field three levels down would carry its whole path inline -
 * `at(at(at(path, 'capture'), 'threw'), 'name')` - and the generated file would be unreadable for
 * no gain: the place is the same string however many times it is spelled.
 */
function bindPath(
  path: string,
  fresh: (stem: string) => string
): { where: string; lines: string[] } {
  if (/^[A-Za-z_$][\w$]*$/.test(path)) return { where: path, lines: [] };

  const where = fresh('where');
  return { where, lines: [`const ${where} = ${path};`] };
}

function emitArrayCheck(
  element: Shape,
  value: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  if (element.kind === 'string') return [`expectStringArray(${value}, ${path}, problems);`];

  const { where, lines: bound } = bindPath(path, fresh);
  const list = fresh('list');
  const entry = fresh('entry');
  const index = fresh('index');

  return [
    ...bound,
    `const ${list} = asArray(${value}, ${where}, problems);`,
    `if (${list}) {`,
    `${list}.forEach((${entry}, ${index}) => {`,
    ...emitCheck(element, entry, `atIndex(${where}, ${index})`, fresh),
    '});',
    '}',
  ];
}

function emitMapCheck(
  entryShape: Shape,
  value: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  if (entryShape.kind === 'unknown') return [`asObject(${value}, ${path}, problems);`];

  const { where, lines: bound } = bindPath(path, fresh);
  const map = fresh('map');
  const lines = [...bound, `const ${map} = asObject(${value}, ${where}, problems);`, `if (${map}) {`];

  if (entryShape.kind === 'never') {
    lines.push(`reportUnknownFields(${map}, [], ${where}, problems);`);
  } else {
    const key = fresh('key');
    lines.push(
      `for (const ${key} of Object.keys(${map})) {`,
      ...emitCheck(entryShape, `${map}[${key}]`, `atKey(${where}, ${key})`, fresh),
      '}'
    );
  }

  lines.push('}');
  return lines;
}

function emitObjectCheck(
  fields: Field[],
  value: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  const { where, lines: bound } = bindPath(path, fresh);
  const object = fresh('object');
  const lines = [
    ...bound,
    `const ${object} = asObject(${value}, ${where}, problems);`,
    `if (${object}) {`,
  ];

  for (const field of fields) {
    const checks = emitCheck(
      field.shape,
      `${object}.${field.name}`,
      `at(${where}, '${field.name}')`,
      fresh
    );

    if (checks.length === 0) continue;

    if (field.optional) lines.push(`if ('${field.name}' in ${object}) {`, ...checks, '}');
    else lines.push(...checks);
  }

  const known = fields.map((field) => `'${field.name}'`).join(', ');
  lines.push(`reportUnknownFields(${object}, [${known}], ${where}, problems);`, '}');

  return lines;
}

/* -------------------------------------------------------------------------- *
 * A union: which branch a value is, and what it is refused with when it is     *
 * none of them.                                                                *
 * -------------------------------------------------------------------------- */

function emitUnionCheck(
  members: Shape[],
  expression: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  if (members.some((member) => member.kind === 'unknown')) return [];

  if (members.every((member) => member.kind === 'literal' && typeof member.value === 'string')) {
    const allowed = members.map((member) => `'${(member as { value: string }).value}'`).join(', ');
    return [`expectOneOf(${expression}, [${allowed}], ${path}, problems);`];
  }

  // Bound to a name of its own: `isPlainObject(someObject.answer)` tells TypeScript nothing about
  // `someObject.answer`, and every branch below reads the value as the shape its test proved.
  const value = fresh('oneOf');
  const bound = bindPath(path, fresh);
  const where = bound.where;
  const branches: Array<{ test: string; body: string[] }> = [];
  const straightThrough: string[] = [];

  for (const member of members) {
    if (member.kind === 'null') straightThrough.push(`${value} === null`);
    if (member.kind === 'literal') straightThrough.push(`${value} === ${literalText(member.value)}`);
    if (member.kind === 'string') straightThrough.push(`typeof ${value} === 'string'`);
    if (member.kind === 'number') straightThrough.push(`typeof ${value} === 'number'`);
    if (member.kind === 'boolean') straightThrough.push(`typeof ${value} === 'boolean'`);
  }

  if (straightThrough.length > 0) {
    branches.push({ test: straightThrough.join(' || '), body: ['// the value is one of these'] });
  }

  const arrays = members.filter((member) => member.kind === 'array');
  if (arrays.length === 1) {
    branches.push({
      test: `Array.isArray(${value})`,
      body: emitCheck(arrays[0], value, where, fresh),
    });
  } else if (arrays.length > 1) {
    throw new Error('a union with two list branches has no rule for telling them apart');
  }

  const objects = members.filter(
    (member) => member.kind === 'object' || member.kind === 'map' || member.kind === 'named'
  );
  if (objects.length === 1) {
    branches.push({
      test: `isPlainObject(${value})`,
      body: emitCheck(objects[0], value, where, fresh),
    });
  } else if (objects.length > 1) {
    branches.push({
      test: `isPlainObject(${value})`,
      body: emitDiscrimination(objects, value, where, fresh),
    });
  }

  const refusal = `reportWrongShape(${value}, ${quote(prose(members))}, ${where}, problems);`;

  return [
    `const ${value} = ${expression};`,
    ...bound.lines,
    ...branches.flatMap((branch, index) => [
      `${index === 0 ? 'if' : '} else if'} (${branch.test}) {`,
      ...branch.body,
    ]),
    '} else {',
    refusal,
    '}',
  ];
}

/**
 * Which of several object branches a value is.
 *
 * A branch is told by the one field only it has: the `call` a scripted answer names, the `crashed`
 * a capture that died carries. A union whose branches cannot be told apart that way is refused
 * HERE, while somebody is looking at the seam - never at run time, where it would read as a value
 * being the wrong shape.
 */
function emitDiscrimination(
  branches: Shape[],
  value: string,
  path: string,
  fresh: (stem: string) => string
): string[] {
  const discriminant = discriminantOf(branches);

  if (discriminant) {
    const names = discriminant.values.map((one) => `'${one}'`).join(', ');
    const lines = branches.flatMap((branch, index) => [
      `${index === 0 ? 'if' : '} else if'} (${value}.${discriminant.field} === ` +
        `'${discriminant.values[index]}') {`,
      ...emitCheck(branch, value, path, fresh),
    ]);

    return [
      ...lines,
      '} else {',
      `reportUnknownName(${value}.${discriminant.field}, [${names}], ` +
        `at(${path}, '${discriminant.field}'), problems);`,
      '}',
    ];
  }

  const told = branches.map((branch) => ({ branch, only: onlyFieldOf(branch, branches) }));
  const named = told.filter((one) => one.only !== undefined);
  const rest = told.filter((one) => one.only === undefined);

  if (rest.length > 1) {
    throw new Error('a union has two object branches with no field that tells them apart');
  }

  if (named.length === 0) return emitCheck(rest[0].branch, value, path, fresh);

  const lines = named.flatMap((one, index) => [
    `${index === 0 ? 'if' : '} else if'} ('${one.only}' in ${value}) {`,
    ...emitCheck(one.branch, value, path, fresh),
  ]);

  return [
    ...lines,
    '} else {',
    ...(rest.length === 1
      ? emitCheck(rest[0].branch, value, path, fresh)
      : [`reportWrongShape(${value}, ${quote(prose(branches))}, ${path}, problems);`]),
    '}',
  ];
}

/** The field every branch has, holding a different word in each - what a scripted call's `call` is. */
function discriminantOf(branches: Shape[]): { field: string; values: string[] } | undefined {
  const first = fieldsOf(branches[0]);

  for (const candidate of first) {
    if (candidate.optional || candidate.shape.kind !== 'literal') continue;
    if (typeof candidate.shape.value !== 'string') continue;

    const values = branches.map((branch) => {
      const field = fieldsOf(branch).find((one) => one.name === candidate.name);
      if (!field || field.optional || field.shape.kind !== 'literal') return undefined;
      return typeof field.shape.value === 'string' ? field.shape.value : undefined;
    });

    if (values.some((one) => one === undefined)) continue;
    if (new Set(values).size !== values.length) continue;

    return { field: candidate.name, values: values as string[] };
  }

  return undefined;
}

/** The first field this branch requires and no other branch has at all. */
function onlyFieldOf(branch: Shape, branches: Shape[]): string | undefined {
  const others = branches.filter((one) => one !== branch).map(fieldsOf);

  return fieldsOf(branch).find(
    (field) =>
      !field.optional && others.every((other) => !other.some((one) => one.name === field.name))
  )?.name;
}

/** The fields a branch has - a named branch's are the fields of the type it names. */
function fieldsOf(shape: Shape): Field[] {
  if (shape.kind === 'object') return shape.fields;
  if (shape.kind === 'named') return fieldsOf(publishedBodies.get(shape.name) as Shape);
  return [];
}

/** Every published type's body, so a branch named rather than written out can still be read. */
const publishedBodies = new Map<string, Shape>();

/* -------------------------------------------------------------------------- */

/** What a value could have been, said the way a person would say it. */
function prose(shapes: Shape[]): string {
  const said = shapes.map(proseOf);
  if (said.length === 1) return said[0];

  return `${said.slice(0, -1).join(', ')} or ${said[said.length - 1]}`;
}

function proseOf(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return 'a string';
    case 'number':
      return 'a number';
    case 'boolean':
      return 'true/false';
    case 'unknown':
      return 'anything';
    case 'never':
      return 'nothing';
    case 'null':
      return '`null`';
    case 'literal':
      return `\`${JSON.stringify(shape.value)}\``;
    case 'map':
      return 'an object';
    case 'array':
      return shape.of.kind === 'string' ? 'an array of strings' : `\`${inlineText(shape)}\``;
    case 'union':
      return prose(shape.of);
    case 'named':
    case 'object':
      return `\`${inlineText(shape)}\``;
  }
}

/** One type on one line, for a sentence rather than for a file. */
function inlineText(shape: Shape): string {
  if (shape.kind === 'object') {
    const fields = shape.fields.map(
      (field) => `${field.name}${field.optional ? '?' : ''}: ${inlineText(field.shape)}`
    );
    return `{ ${fields.join('; ')} }`;
  }
  if (shape.kind === 'array') {
    return shape.of.kind === 'object' || shape.of.kind === 'union'
      ? `Array<${inlineText(shape.of)}>`
      : `${inlineText(shape.of)}[]`;
  }
  if (shape.kind === 'map') return `Record<string, ${inlineText(shape.of)}>`;
  if (shape.kind === 'union') return shape.of.map(inlineText).join(' | ');

  return typeText(shape, 0);
}

function quote(text: string): string {
  return JSON.stringify(text);
}

function format(source: string, file: string): string {
  const options = prettier.resolveConfig.sync(file) ?? {};
  return prettier.format(source, { ...options, filepath: file, parser: 'typescript' });
}

/* ========================================================================== */

main();
