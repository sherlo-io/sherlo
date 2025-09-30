import {StyleSheet, Text, View} from 'react-native';

const KillDeviceStory = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        This story will kill the device after testing.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    marginBottom: 20,
  },
});

export default KillDeviceStory;
