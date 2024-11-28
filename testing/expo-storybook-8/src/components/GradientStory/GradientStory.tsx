import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LinearGradient as ReactNativeLinearGradient } from 'react-native-linear-gradient';

const colors = [
  '#FF0000',
  '#FF7F00',
  '#FFFF00',
  '#00FF00',
  '#0000FF',
  '#4B0082',
  '#8B00FF',
] as const;
const GradientStory = ({
  library,
}: {
  library: 'expo-linear-gradient' | 'react-native-linear-gradient';
}) => {
  return library === 'expo-linear-gradient' ? (
    <LinearGradient
      colors={colors}
      style={StyleSheet.absoluteFillObject}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    />
  ) : (
    <ReactNativeLinearGradient colors={[...colors]} style={StyleSheet.absoluteFillObject} />
  );
};

export default GradientStory;
