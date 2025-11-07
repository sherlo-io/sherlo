import { View, Text, Button, StyleSheet } from 'react-native';
import { openStorybook } from '@sherlo/react-native-storybook';
import * as Localization from 'expo-localization';

console.log('[SHERLO:app] expo-localization keys:', Object.keys(Localization));
console.log(
  '[SHERLO:app] sample getLocales():',
  (() => {
    try {
      return Localization.getLocales?.();
    } catch (e) {
      return 'ERR:' + e?.message;
    }
  })()
);

const HomeScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {`Language: ${Localization.getLocales()[0].languageCode}\n`}
        {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
      </Text>

      {/**
       * This button will reload the app
       * and open it again in Storybook mode
       */}
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
