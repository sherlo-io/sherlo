import { View, StyleSheet } from 'react-native';

const NoSafeArea = () => {
  return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'red' }]} />;
};

export default NoSafeArea;
