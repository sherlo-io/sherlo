import {useEffect} from 'react';
import {View, Text, StyleSheet, useColorScheme, StatusBar} from 'react-native';

const StatusBarChangeStory = ({
  property,
}: {
  property:
    | 'backgroundColor'
    | 'hidden'
    | 'darkContent'
    | 'lightContent'
    | 'withoutTranslucent';
}) => {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (property === 'backgroundColor') {
      StatusBar.setBackgroundColor('#f00', false);
    } else if (property === 'hidden') {
      StatusBar.setHidden(true);
    } else if (property === 'darkContent') {
      StatusBar.setBarStyle('dark-content');
    } else if (property === 'lightContent') {
      StatusBar.setBarStyle('light-content');
    } else if (property === 'withoutTranslucent') {
      StatusBar.setTranslucent(false);
    }
  }, [colorScheme, property]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        This component changes "{property}" property of the status bar
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

export default StatusBarChangeStory;
