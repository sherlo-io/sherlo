import { useEffect } from 'react';
import CrashTester from 'react-native-crash-tester';

const CrashStory = () => {
  useEffect(() => {
    CrashTester.nativeCrash();
  }, []);

  return null;
};

export default CrashStory;
