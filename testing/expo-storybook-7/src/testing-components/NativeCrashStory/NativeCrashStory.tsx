import { useEffect } from 'react';
import { View } from 'react-native';
import CrashTester from 'react-native-crash-tester';

const NativeCrashStory = () => {
  useEffect(() => {
    CrashTester.nativeCrash();
  }, []);

  return <View />;
};

export default NativeCrashStory;
