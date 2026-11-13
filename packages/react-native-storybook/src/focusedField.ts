/**
 * THE FIELD A SCREEN MEANS TO HAVE FOCUSED: a text field drawn with `autoFocus` is shot only once
 * it holds focus, never before, or the caret flips the picture from run to run. The wait is for the
 * field taking focus, not for the keyboard (a hardware keyboard shows none); a keyboard animating
 * in is the settle rule's to wait for. The wait is the settle limit's own (./storyReady). Where the
 * native side locks focus (iOS driven by the runner) no field can take it, so none is waited for.
 */
import { TextInput } from 'react-native';
import SherloModule from './SherloModule';
import { currentAppFiber } from './componentNames';
import type { WalkedFiber } from './sealedCore/seam';
import { hostViewsMatching, publicInstanceOf } from './tapReach';
import { TEXT_FIELD_HOSTS } from './typeInto';

/**
 * The names of the auto-focused text fields on screen that do not yet hold focus: the testID, else
 * the placeholder, else the plain words "text field". Empty when nothing waits.
 */
export function fieldsStillWaitingForFocus(): string[] {
  const root = currentAppFiber();
  if (!root) return [];
  const fields = hostViewsMatching(
    root,
    (fiber) => TEXT_FIELD_HOSTS.includes(fiber.type) && fiber.memoizedProps?.autoFocus === true
  );
  if (fields.length === 0 || !SherloModule.fieldsTakeFocus()) return [];
  const focused = TextInput?.State?.currentlyFocusedInput?.();
  return fields
    .filter((field) => focused == null || focused !== publicInstanceOf(field))
    .map(nameOfField);
}

function nameOfField(field: WalkedFiber): string {
  const { testID, placeholder } = field.memoizedProps ?? {};
  if (typeof testID === 'string') return testID;
  return typeof placeholder === 'string' ? placeholder : 'text field';
}
