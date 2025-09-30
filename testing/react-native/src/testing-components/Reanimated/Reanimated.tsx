import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, View, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const MIN_SEGMENT_WIDTH = 14;

type SegmentProps = {
  progress: SharedValue<number>;
  current: number;
  selectedWidth: number;
  color: string;
};

const Segment = ({ progress, current, selectedWidth, color }: SegmentProps) => {
  const animatedSegmentStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(
        progress.value,
        [current - 1, current, current + 1],
        [MIN_SEGMENT_WIDTH, selectedWidth, MIN_SEGMENT_WIDTH],
        {
          extrapolateLeft: Extrapolation.CLAMP,
          extrapolateRight: Extrapolation.CLAMP,
        }
      ),
      opacity: interpolate(progress.value, [current - 1, current, current + 1], [0.25, 1, 0.25], {
        extrapolateLeft: Extrapolation.CLAMP,
        extrapolateRight: Extrapolation.CLAMP,
      }),
    };
  });

  const style = {
    ...segmentStyle,
    backgroundColor: color,
  };

  return <Animated.View style={[style, animatedSegmentStyle]} />;
};

const SegmentedProgressBar = ({
  progress,
  total,
  color = '#3498db',
}: SegmentedProgressBarProps) => {
  const [containerWidth, setContainerWidth] = useState(0);

  const selectedWidth = React.useMemo(() => {
    // Account for margins on both sides of each segment
    const totalMargins = total * 4;
    // Minimum width of each unselected segment
    const unselectedSegmentsWidth = (total - 1) * MIN_SEGMENT_WIDTH;
    // Available width for selected segment
    return containerWidth - totalMargins - unselectedSegmentsWidth;
  }, [total, containerWidth]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={[containerStyle]} onLayout={onLayout}>
      {Array.from({ length: total }).map((_, index) => (
        <Segment
          key={index}
          progress={progress}
          current={index + 1}
          selectedWidth={selectedWidth}
          color={color}
        />
      ))}
    </View>
  );
};

const containerStyle: ViewStyle = {
  flexDirection: 'row',
  height: 6,
};

const segmentStyle: ViewStyle = {
  height: 6,
  minWidth: MIN_SEGMENT_WIDTH,
  marginHorizontal: 2,
  borderRadius: 3,
};

export type SegmentedProgressBarProps = {
  progress: SharedValue<number>;
  total: number;
  color?: string;
};

export default SegmentedProgressBar;
