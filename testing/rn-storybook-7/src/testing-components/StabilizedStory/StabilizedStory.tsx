import React from 'react';
import { isRunningVisualTests } from '@sherlo/react-native-storybook';
import { ActivityIndicator, Text } from 'react-native';

const StabilizedStory = () => {
  return (
    <>
      <ActivityIndicator animating={!isRunningVisualTests} />
      <Text>Stabilized Activity Indicator</Text>
    </>
  );
};

export default StabilizedStory;
