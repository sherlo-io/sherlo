import { View, Text, Button, StyleSheet } from 'react-native';
import { openStorybook } from '@sherlo/react-native-storybook';

const HomeScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
      </Text>

      <Button title="Open Storybook" onPress={openStorybook} />
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
    textAlign: 'center',
  },
});

export default HomeScreen;
