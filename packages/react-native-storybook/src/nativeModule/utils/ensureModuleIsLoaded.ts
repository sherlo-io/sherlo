import { NativeModules } from 'react-native';

const { RNSherlo: RNSherlo } = NativeModules;

export function ensureModuleIsLoaded(): void {
  if (!RNSherlo) {
    throw new Error(
      '@sherlo/react-natve: NativeModules.RNSherlo is undefined. Make sure the library is linked on the native side.'
    );
  }
}
