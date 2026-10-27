/**
 * THE TEXT INPUT'S OWN NATIVE COMMANDS: what React Native's TextInput calls to keep the native text
 * in step with its value on the new architecture (Fabric), where setNativeProps({ text }) may do
 * nothing. Read from react-native's own native component of each host, the way TextInput picks them.
 */
export type TextInputCommands = {
  setTextAndSelection: (
    instance: unknown,
    eventCount: number,
    text: string | null,
    start: number,
    end: number
  ) => void;
};

/** The commands of the text field host `hostType`, or undefined when this react-native has none. */
export function textInputCommandsFor(hostType: string): TextInputCommands | undefined {
  try {
    const component =
      hostType === 'AndroidTextInput'
        ? require('react-native/Libraries/Components/TextInput/AndroidTextInputNativeComponent')
        : hostType === 'RCTMultilineTextInputView'
          ? require('react-native/Libraries/Components/TextInput/RCTMultilineTextInputNativeComponent')
          : require('react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent');
    const commands = component?.Commands;
    return typeof commands?.setTextAndSelection === 'function' ? commands : undefined;
  } catch {
    // This react-native does not ship that component: the caller then has no command and says so.
    return undefined;
  }
}
