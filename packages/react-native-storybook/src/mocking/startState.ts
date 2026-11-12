import { isPlainObject } from './mergeDefinitions';
import { hasOwn, isObjectOrFunction, writeUndoably } from './overlay';
import { DeepPartial, ModuleExports } from './types';

/**
 * What a scene lists to start a real library object already holding the state it needs, such as a
 * signed-in chat client. `activate` is called while the scene's mocks are active, before its first
 * render; the old values are put back when the scene's mocks are cleared.
 */
export type StartState = { activate: () => void };

// Writes each named field onto `target`, going into a plain-object field that both sides hold so
// the rest of that field stays as it is. Every write is undone, newest first, when the mocks clear.
function writeFields(target: ModuleExports, fields: ModuleExports): void {
  Reflect.ownKeys(fields).forEach((key) => {
    const value = fields[key];
    const current = hasOwn(target, key) ? target[key] : undefined;
    if (isPlainObject(value) && isObjectOrFunction(current)) {
      writeFields(current, value);
      return;
    }
    writeUndoably(target, key, () => Reflect.set(target, key, value));
  });
}

/**
 * Declares fields a real object holds when the scene starts:
 *
 *   preconditions: [startState(chatClient, { user: { id: 'ada' } })]
 *
 * `fields` names only parts `target`'s type has, at any depth.
 */
export function startState<T extends object>(target: T, fields: DeepPartial<T>): StartState {
  return { activate: () => writeFields(target as ModuleExports, fields as ModuleExports) };
}
