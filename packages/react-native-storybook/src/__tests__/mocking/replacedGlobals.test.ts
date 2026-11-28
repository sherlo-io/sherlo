/**
 * The one helper the mock layer replaces and restores a global through (../../mocking/replacedGlobals),
 * each of its rules pinned once, and the guard that no other file of the layer does it by hand.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';
import { Node, traverseFast, VISITOR_KEYS } from '@babel/types';
import { describe, expect, it } from 'vitest';
import {
  appsOwn,
  installReplacement,
  isReplaced,
  restoreOriginal,
} from '../../mocking/replacedGlobals';

function holderWith(value: unknown): Record<string, unknown> {
  return { thing: value };
}

describe('the helper that replaces and restores a global', () => {
  it('install puts the replacement where the app reads the value', () => {
    const holder = holderWith('real');
    installReplacement(holder, 'thing', 'fake');
    expect(holder.thing).toBe('fake');
    expect(isReplaced(holder, 'thing')).toBe(true);
  });

  it('restore puts the very first value back and forgets it', () => {
    const holder = holderWith('real');
    installReplacement(holder, 'thing', 'fake');
    restoreOriginal(holder, 'thing');
    expect(holder.thing).toBe('real');
    expect(isReplaced(holder, 'thing')).toBe(false);
  });

  it('a second install over the first does not lose the original', () => {
    const holder = holderWith('real');
    installReplacement(holder, 'thing', 'first fake');
    installReplacement(holder, 'thing', 'second fake');
    expect(appsOwn(holder, 'thing')).toBe('real');
    restoreOriginal(holder, 'thing');
    expect(holder.thing).toBe('real');
  });

  it('restore with nothing installed leaves the value alone', () => {
    const holder = holderWith('real');
    restoreOriginal(holder, 'thing');
    expect(holder.thing).toBe('real');
  });

  it('a property the holder only inherits becomes an own one and is removed again on restore', () => {
    const holder = Object.create(Object.freeze({ thing: 'real' })) as Record<string, unknown>;
    installReplacement(holder, 'thing', 'fake');
    expect(Object.prototype.hasOwnProperty.call(holder, 'thing')).toBe(true);
    expect(holder.thing).toBe('fake');
    restoreOriginal(holder, 'thing');
    expect(Object.prototype.hasOwnProperty.call(holder, 'thing')).toBe(false);
    expect(holder.thing).toBe('real');
  });

  it('a property the holder lacks is made on install and removed on restore', () => {
    const holder: Record<string, unknown> = {};
    installReplacement(holder, 'thing', 'fake');
    expect(holder.thing).toBe('fake');
    restoreOriginal(holder, 'thing');
    expect('thing' in holder).toBe(false);
  });

  it('an accessor is written through its setter and comes back as the same accessor', () => {
    const written: unknown[] = [];
    const getter = (): string => 'real';
    const setter = (value: unknown): void => {
      written.push(value);
    };
    const holder = {};
    Object.defineProperty(holder, 'thing', {
      get: getter,
      set: setter,
      configurable: true,
      enumerable: true,
    });
    installReplacement(holder, 'thing', 'fake');
    expect(written).toEqual(['fake']);
    restoreOriginal(holder, 'thing');
    const back = Object.getOwnPropertyDescriptor(holder, 'thing');
    expect(back?.get).toBe(getter);
    expect(back?.set).toBe(setter);
  });

  it('a read-only property that can be configured is refused as an assignment is', () => {
    const holder = {};
    Object.defineProperty(holder, 'thing', { value: 'real', writable: false, configurable: true });
    expect(() => installReplacement(holder, 'thing', 'fake')).toThrow(TypeError);
    expect(isReplaced(holder, 'thing')).toBe(false);
    expect(Object.getOwnPropertyDescriptor(holder, 'thing')?.value).toBe('real');
  });

  it('a writable property that cannot be configured is replaced and keeps its flags on restore', () => {
    const holder = {};
    Object.defineProperty(holder, 'thing', { value: 'real', writable: true, configurable: false });
    installReplacement(holder, 'thing', 'fake');
    expect((holder as Record<string, unknown>).thing).toBe('fake');
    restoreOriginal(holder, 'thing');
    expect(Object.getOwnPropertyDescriptor(holder, 'thing')).toEqual({
      value: 'real',
      writable: true,
      enumerable: false,
      configurable: false,
    });
  });

  it('appsOwn reads the current value when nothing stands in', () => {
    expect(appsOwn(holderWith('real'), 'thing')).toBe('real');
  });

  it('a property the engine holds to its value is refused by the shared rule', () => {
    const holder = {};
    Object.defineProperty(holder, 'thing', { value: 'real', writable: false, configurable: false });
    expect(() => installReplacement(holder, 'thing', 'fake')).toThrow(/holds it to its value/);
    expect(isReplaced(holder, 'thing')).toBe(false);
  });
});

describe('the mock layer replaces a global only through that helper', () => {
  const MOCKING_DIR = path.resolve(__dirname, '..', '..', 'mocking');
  // The writes that are not an install of a global, each named as `file: function writes to
  // holder` with why. A write inside one of these places goes unchecked: the guard sees none of
  // what else that function does to that holder.
  const WRITES_THAT_ARE_NOT_AN_INSTALL: Record<string, string> = {
    'createMockable.ts: createForwardingDefault writes to (an expression)':
      'a stand-in forwards the app writes to the module it stands for, undone by writeUndoably',
    'createMockable.ts: buildMockable writes to (an expression)':
      'a stand-in forwards the app writes to the module it stands for, undone by writeUndoably',
    'createMockable.ts: loadThrowingWhatItThrew writes to errorUtils':
      'a swap that can nest and puts its own value back in a finally, level by level; the helper keeps the first value only, so it would be wrong nested',
    'overlay.ts: layerOver writes to (an expression)':
      'a layer forwards the app writes to the real part, undone by writeUndoably',
    'startState.ts: writeFields writes to target':
      'a scene sets fields of a real object, undone by writeUndoably',
    'registry.ts: (module) writes to host':
      'a marker on the global object that is never restored and replaces nothing',
    'registry.ts: markStorySettled writes to activeActivation':
      'a flag on the registry own record, not a global',
  };

  // The rule names no holder: a write that replaces a member (assignment to a member, or
  // Object.defineProperty, Reflect.set, Reflect.defineProperty) of any object the file did not
  // create itself. It cannot see through an alias of an object made in the file that holds a
  // foreign one, nor a write made by a function it is handed (`set(holder, ...)`).
  function writesToAForeignHolder(source: string): string[] {
    const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
    const own = new Set<string>(['this']);
    traverseFast(ast, (node) => {
      if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
        own.add(node.id.name);
      }
      if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !node.init) return;
      let init: Node = node.init;
      while (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') {
        init = init.expression;
      }
      if (['ObjectExpression', 'ArrayExpression', 'NewExpression'].includes(init.type)) {
        own.add(node.id.name);
      }
    });
    const rootOf = (node: Node): string | null => {
      let at: Node = node;
      for (;;) {
        if (at.type === 'MemberExpression' || at.type === 'OptionalMemberExpression') {
          at = at.object;
        } else if (at.type === 'TSAsExpression' || at.type === 'TSNonNullExpression') {
          at = at.expression;
        } else {
          break;
        }
      }
      if (at.type === 'ThisExpression') return 'this';
      return at.type === 'Identifier' ? at.name : '(an expression)';
    };
    const found: string[] = [];
    // Each node is seen with the name of the function declaration it sits in ('(module)' outside one).
    const visit = (node: Node, inside: string): void => {
      const here = node.type === 'FunctionDeclaration' && node.id ? node.id.name : inside;
      look(node, here);
      for (const key of VISITOR_KEYS[node.type] ?? []) {
        const child = (node as unknown as Record<string, unknown>)[key];
        for (const one of Array.isArray(child) ? child : [child]) {
          if (one && typeof (one as Node).type === 'string') visit(one as Node, here);
        }
      }
    };
    const look = (node: Node, inside: string): void => {
      let holder: Node | null = null;
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
        holder = node.left;
      } else if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        ['Object', 'Reflect'].includes(node.callee.object.name) &&
        node.callee.property.type === 'Identifier' &&
        ['defineProperty', 'set'].includes(node.callee.property.name) &&
        node.arguments[0]
      ) {
        holder = node.arguments[0];
      }
      const root = holder ? rootOf(holder) : null;
      if (holder && root && !own.has(root)) found.push(`${inside} writes to ${root}`);
    };
    visit(ast.program, '(module)');
    return found;
  }

  function filesThatInstallByHand(files: Record<string, string>): string[] {
    return Object.keys(files).filter((name) =>
      writesToAForeignHolder(files[name]).some(
        (write) => !(`${name}: ${write}` in WRITES_THAT_ARE_NOT_AN_INSTALL)
      )
    );
  }

  it('no file of the mock layer but the helper writes a global by hand', () => {
    const files: Record<string, string> = {};
    for (const name of fs.readdirSync(MOCKING_DIR)) {
      if (name.endsWith('.ts') && name !== 'replacedGlobals.ts' && name !== 'exactUndo.ts') {
        files[name] = fs.readFileSync(path.join(MOCKING_DIR, name), 'utf8');
      }
    }
    expect(filesThatInstallByHand(files)).toEqual([]);
  });

  it('the guard goes red on a planted hand-written install of each shape', () => {
    const planted = [
      'global.Date = FakeDate;',
      'Math.random = () => 1;',
      'const globals = globalThis as unknown as G; globals.fetch = fake;',
      '(globalThis as unknown as G).fetch = fake;',
      'Object.defineProperty(nativeSockets, "connect", { value: f });',
      'import { moduleObject } from "x"; moduleObject.call = f;',
      'Reflect.set(someHolder, "key", 1);',
      'Reflect.defineProperty(globalThis, "x", {});',
    ];
    for (const source of planted) {
      expect(filesThatInstallByHand({ planted: source }), source).toEqual(['planted']);
    }
  });

  it('the guard goes red on a hand install in a file that has an exempt write, outside that write', () => {
    const outside = 'function otherThing() { globalThis.fetch = fake; }';
    const insideOtherHolder = 'function loadThrowingWhatItThrew() { globalThis.fetch = fake; }';
    const marker = 'const other = globalThis; other.Date = Fake;';
    const exempt = 'function loadThrowingWhatItThrew() { errorUtils.reportFatalError = f; }';
    expect(filesThatInstallByHand({ 'createMockable.ts': outside })).toEqual(['createMockable.ts']);
    expect(filesThatInstallByHand({ 'createMockable.ts': insideOtherHolder })).toEqual([
      'createMockable.ts',
    ]);
    expect(filesThatInstallByHand({ 'registry.ts': marker })).toEqual(['registry.ts']);
    expect(filesThatInstallByHand({ 'createMockable.ts': exempt })).toEqual([]);
  });

  it('the guard stays green on writes to an object the file made itself and on the helper', () => {
    const clean = [
      'installReplacement(global, "Date", Fake);',
      'const made = {}; made.x = 1; Object.defineProperty(made, "y", {});',
      'class A { constructor() { this.x = 1; Object.defineProperty(this, "y", {}); } }',
    ];
    for (const source of clean) {
      expect(filesThatInstallByHand({ clean: source }), source).toEqual([]);
    }
  });
});
