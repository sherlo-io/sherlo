/**
 * THE SMALL CHECKS A POSE IS REFUSED BY, and the one refusal they are gathered into.
 *
 * Every function here does the same thing: it looks at one value, and when the value is wrong it
 * appends ONE sentence to `problems`. Nothing throws and nothing returns early, because a pose is
 * written by hand - a reader that stopped at the first problem would make fixing one a round trip
 * per mistake. ./readPose gathers them all and refuses once.
 *
 * WHERE A PROBLEM HAPPENED IS A PLAIN PATH - `argv`, `git.dirty`, `bundles["android"].assets[0]` -
 * and {@link formatWhere} is the one place that decides how it is spelled back to the person who
 * wrote the pose. That matters because ./readPose.generated is written by a program: the wording
 * of a refusal lives here, by hand, and the generator only decides which check runs where.
 */

/** Every problem the reader found, in one error - see ./readPose for why all of them at once. */
export class PoseRefusal extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      'This is not a CommandPose (contracts/pose.contract.ts). ' +
        `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n')
    );
    this.name = 'PoseRefusal';
    this.problems = problems;
  }
}

/**
 * How a place in the document is spelled back: the first field in backticks, and whatever leads
 * from it outside them - `` `git`.dirty ``, `` `bundles["android"]`.assets ``. The empty path is
 * the document itself, which has no field to name.
 */
export function formatWhere(path: string): string {
  if (path === '') return 'the document';

  const firstDot = indexOfTopLevelDot(path);
  if (firstDot === -1) return `\`${path}\``;

  return `\`${path.slice(0, firstDot)}\`${path.slice(firstDot)}`;
}

/** The position of the dot that separates the first field from the rest, ignoring dots inside `["..."]`. */
function indexOfTopLevelDot(path: string): number {
  let insideBrackets = false;

  for (let index = 0; index < path.length; index++) {
    if (path[index] === '[') insideBrackets = true;
    else if (path[index] === ']') insideBrackets = false;
    else if (path[index] === '.' && !insideBrackets) return index;
  }

  return -1;
}

/** The path of a field of the thing at `path`. */
export function at(path: string, field: string): string {
  return path === '' ? field : `${path}.${field}`;
}

/** The path of the entry `key` holds in the map at `path`. */
export function atKey(path: string, key: string): string {
  return `${path}["${key}"]`;
}

/** The path of the entry at position `index` in the list at `path`. */
export function atIndex(path: string, index: number): string {
  return `${path}[${index}]`;
}

/** How a wrong value is named back to the person who wrote it. */
export function describe(value: unknown): string {
  if (value === undefined) return 'nothing (the field is missing)';
  if (value === null) return '`null`';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  return `\`${JSON.stringify(value)}\``;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObject(
  value: unknown,
  path: string,
  problems: string[]
): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value;
  problems.push(`${formatWhere(path)}: expected an object, got ${describe(value)}`);
  return undefined;
}

export function asArray(value: unknown, path: string, problems: string[]): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  problems.push(`${formatWhere(path)}: expected an array, got ${describe(value)}`);
  return undefined;
}

export function expectString(value: unknown, path: string, problems: string[]): void {
  if (typeof value !== 'string') {
    problems.push(`${formatWhere(path)}: expected a string, got ${describe(value)}`);
  }
}

export function expectNumber(value: unknown, path: string, problems: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${formatWhere(path)}: expected a number, got ${describe(value)}`);
  }
}

export function expectBoolean(value: unknown, path: string, problems: string[]): void {
  if (typeof value !== 'boolean') {
    problems.push(`${formatWhere(path)}: expected true or false, got ${describe(value)}`);
  }
}

/** The one value a field may hold, written out - a version number, a flag that is only ever `true`. */
export function expectLiteral(
  value: unknown,
  literal: string | number | boolean,
  path: string,
  problems: string[]
): void {
  if (value !== literal) {
    problems.push(
      `${formatWhere(path)}: expected \`${JSON.stringify(literal)}\`, got ${describe(value)}`
    );
  }
}

export function expectOneOf(
  value: unknown,
  allowed: readonly string[],
  path: string,
  problems: string[]
): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    problems.push(
      `${formatWhere(path)}: expected one of ${allowed.map((one) => `\`${one}\``).join(', ')}, ` +
        `got ${describe(value)}`
    );
  }
}

export function expectStringArray(value: unknown, path: string, problems: string[]): void {
  if (!Array.isArray(value)) {
    problems.push(`${formatWhere(path)}: expected an array of strings, got ${describe(value)}`);
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      problems.push(
        `${formatWhere(atIndex(path, index))}: expected a string, got ${describe(entry)}`
      );
    }
  });
}

/** A value none of a union's branches accepted, named with the branches it could have been. */
export function reportWrongShape(
  value: unknown,
  shapes: string,
  path: string,
  problems: string[]
): void {
  problems.push(`${formatWhere(path)}: expected ${shapes}, got ${describe(value)}`);
}

/** A value that was supposed to name one of a fixed set of things - a scripted call's operation. */
export function reportUnknownName(
  value: unknown,
  names: readonly string[],
  path: string,
  problems: string[]
): void {
  problems.push(
    `${formatWhere(path)}: ${describe(value)} is not one of ` +
      names.map((one) => `\`${one}\``).join(', ')
  );
}

/** An unknown key is refused BY NAME - a pose never has a field quietly ignored. */
export function reportUnknownFields(
  host: Record<string, unknown>,
  known: readonly string[],
  path: string,
  problems: string[]
): void {
  for (const field of Object.keys(host)) {
    if (known.includes(field)) continue;
    problems.push(`${formatWhere(at(path, field))}: unknown field`);
  }
}
