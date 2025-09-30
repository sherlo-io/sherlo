import { View, StyleSheet } from 'react-native';

const NoSafeArea = () => {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: 'red', borderWidth: 4, borderColor: 'blue', borderStyle: 'dashed' },
      ]}
    />
  );
};

export default NoSafeArea;
