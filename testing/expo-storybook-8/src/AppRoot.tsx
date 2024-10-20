import { View, Text, Button } from 'react-native';
import { openStorybook } from '@sherlo/react-native-storybook';

const AppRoot = () => {
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
};

export default AppRoot;
