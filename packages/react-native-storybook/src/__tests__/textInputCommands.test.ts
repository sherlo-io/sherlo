// textInputCommands reads the text input's native commands from react-native's own components.
// The test environment aliases react-native to a stub, so no such component is there to read.
import { textInputCommandsFor } from '../textInputCommands';

describe('the text input commands of a host', () => {
  it('gives no commands when this react-native ships no native component for the host', () => {
    expect(textInputCommandsFor('RCTSinglelineTextInputView')).toBeUndefined();
    expect(textInputCommandsFor('AndroidTextInput')).toBeUndefined();
  });
});
