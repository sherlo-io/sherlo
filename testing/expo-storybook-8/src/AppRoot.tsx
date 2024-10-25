import { View, Text, Button } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { openStorybook } from '@sherlo/react-native-storybook';

SplashScreen.preventAutoHideAsync();

export default function AppRoot() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ textAlign: 'center' }}>
        {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
      </Text>
      <Button title="Open Storybook" onPress={openStorybook} />
    </View>
  );
}
