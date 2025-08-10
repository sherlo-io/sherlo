import {StyleSheet} from 'react-native';
import {LinearGradient as ReactNativeLinearGradient} from 'react-native-linear-gradient';

const colors = [
  '#FF0000',
  '#FF7F00',
  '#FFFF00',
  '#00FF00',
  '#0000FF',
  '#4B0082',
  '#8B00FF',
] as const;
const Gradient = () => {
  const props = {
    start: {x: 0, y: 0},
    end: {x: 1, y: 1},
    style: StyleSheet.absoluteFillObject,
  };

  return <ReactNativeLinearGradient colors={[...colors]} {...props} />;
};

export default Gradient;
