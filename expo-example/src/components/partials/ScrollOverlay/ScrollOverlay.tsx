import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { colors } from '../../../theme/colors';
import { dimensions } from '../../../theme/dimensions';

interface ScrollOverlayProps {
  position: 'top' | 'bottom';
  visible: boolean;
}

const ScrollOverlay = ({ position, visible }: ScrollOverlayProps) => {
  const config = {
    duration: 500,
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(visible ? 1 : 0, config),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.gradient, position === 'top' ? { top: 0 } : { bottom: 0 }, animatedStyle]}
    >
      <LinearGradient
        colors={colors.scrollOverlay}
        start={{ x: 0, y: position === 'top' ? 0 : 1 }}
        end={{ x: 0, y: position === 'top' ? 1 : 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    position: 'absolute',
    right: 0,
    left: 0,
    height: dimensions.scrollOverlayHeight,
  },
});

export default ScrollOverlay;
