/**
 * THE TYPE STEP: put text into a text field as typing would.
 *
 * The field's host `onChange` is what a keystroke reaches: React Native's own handler there calls
 * the app's `onChange` and `onChangeText` and keeps a controlled field's state. The native text is
 * set too, so a field the app does not control (a `defaultValue` only) shows it: on the new
 * architecture through the text input's own `setTextAndSelection` command, as React Native's
 * TextInput does, on the old one through the instance's `setNativeProps`.
 */
import type { WalkedFiber } from './sealedCore/seam';
import { nativeTagOf, publicInstanceOf } from './tapReach';
import { textInputCommandsFor } from './textInputCommands';

const TEXT_FIELD_HOSTS = [
  'RCTSinglelineTextInputView',
  'RCTMultilineTextInputView',
  'AndroidTextInput',
];

/** The text field at `fiber`: the view itself, else the first one below it. */
function textFieldIn(fiber: WalkedFiber): WalkedFiber | undefined {
  const pending: WalkedFiber[] = [fiber];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (typeof node.type === 'string' && TEXT_FIELD_HOSTS.includes(node.type)) return node;
    if (node.sibling && node !== fiber) pending.push(node.sibling);
    if (node.child) pending.push(node.child);
  }
  return undefined;
}

/** Whether the app runs on the new architecture: its renderer is Fabric. */
function onNewArchitecture(): boolean {
  return (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager != null;
}

/** Throws one line when the view holds no text field, or when no way to set its text is there. */
export function typeInto(fiber: WalkedFiber, text: string): void {
  const field = textFieldIn(fiber);
  if (!field) {
    throw new Error(
      "not a text field, so nothing could be typed. Point the step at the text field's testID."
    );
  }
  const props = field.memoizedProps;
  const eventCount = props.mostRecentEventCount ?? 0;
  const instance = publicInstanceOf(field) as { setNativeProps?: (props: object) => void };
  const commands = onNewArchitecture() ? textInputCommandsFor(field.type as string) : undefined;
  if (commands) {
    commands.setTextAndSelection(instance, eventCount, text, -1, -1);
  } else if (typeof instance.setNativeProps === 'function') {
    instance.setNativeProps({ text });
  } else {
    throw new Error(
      'this text field takes no native text, so nothing could be typed. Update React Native or point the step at another field.'
    );
  }
  props.onChange?.({ nativeEvent: { text, eventCount, target: nativeTagOf(field) } });
}
