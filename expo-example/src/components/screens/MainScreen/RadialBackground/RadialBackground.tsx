import React, { useEffect, useState } from 'react';
import { Defs, Path, RadialGradient, Stop, Svg } from 'react-native-svg';
import { colors } from '../../../../theme/colors';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

interface RadialBackgroundProps {
  color: 'green' | 'blue';
}

const RadialBackground = ({ color }: RadialBackgroundProps) => {
  const [gradientColor, setGradientColor] = useState(
    color === 'green' ? colors.greenGradient : colors.blueGradient
  );

  const opacity = useSharedValue(1);

  const config = {
    duration: 300,
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useEffect(() => {
    opacity.value = withTiming(0, config, (finished) => {
      if (finished) {
        runOnJS(setGradientColor)(color === 'green' ? colors.greenGradient : colors.blueGradient);
        opacity.value = withTiming(1, config);
      }
    });
  }, [color]);

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <Svg width="304" height="304" viewBox="0 0 304 304" fill="none">
          <Path
            opacity="0.15"
            d="M303.63 0C303.63 39.8733 295.777 79.3562 280.518 116.194C265.259 153.032 242.894 186.504 214.699 214.699C186.504 242.894 153.032 265.259 116.194 280.518C79.3562 295.777 39.8733 303.63 0 303.63L1.32721e-05 0L303.63 0Z"
            fill="url(#paint0_radial_1503_29858)"
          />
          <Defs>
            <RadialGradient
              id="paint0_radial_1503_29858"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(-0.502097 -0.501559) rotate(48.9767) scale(292.176 292.176)"
            >
              <Stop offset="0" stopColor={gradientColor} />
              <Stop offset="1" stopColor={gradientColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>
        </Svg>
      </Animated.View>
    </View>
  );
};

export default RadialBackground;

const styles = StyleSheet.create({
  container: {
    height: '100%',
    width: '100%',
    backgroundColor: colors.background,
    ...StyleSheet.absoluteFillObject,
  },
});
