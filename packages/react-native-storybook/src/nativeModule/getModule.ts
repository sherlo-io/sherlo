import { NativeModules } from 'react-native';

const { RNSherlo } = NativeModules;

export function getModule(): any {
  if (RNSherlo === null) {
    throw new Error(
      '@sherlo/react-natve-storybook: Make sure the library is linked on the native side.'
    );
  }

  return RNSherlo;
}
