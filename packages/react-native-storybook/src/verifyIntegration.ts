import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const verifyIntegration = async () => {
  await SherloModule.verifyIntegration();
};

export default verifyIntegration;
