import React from 'react';
import RadialBackground from './components/RadialBackground';

import { StyleSheet, View } from 'react-native';
import { colors } from '../../../theme/colors';

interface BackgroundProps {
  color: 'green' | 'blue';
}

const Background = ({ color }: BackgroundProps) => {
  let variant;
  switch (color) {
    case 'green':
      variant = <RadialBackground color="green" />;
      break;
    case 'blue':
      variant = <RadialBackground color="blue" />;
      break;

    default:
      throw new Error(`invalid color name: ${color}`);
  }

  return <View style={styles.container}>{variant}</View>;
};

export default Background;

const styles = StyleSheet.create({
  container: {
    height: '100%',
    width: '100%',
    backgroundColor: colors.background,
    ...StyleSheet.absoluteFillObject,
  },
});
