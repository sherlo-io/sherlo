import { isRunningVisualTests } from '@sherlo/react-native-storybook';
import { ActivityIndicator, Text } from 'react-native';

const Stabilized = () => {
  return (
    <>
      <ActivityIndicator animating={!isRunningVisualTests} />
      <Text>Stabilized Activity Indicator</Text>
    </>
  );
};

export default Stabilized;
