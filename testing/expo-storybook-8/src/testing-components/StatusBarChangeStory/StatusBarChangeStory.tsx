import { useEffect } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import * as ExpoStatusBar from 'expo-status-bar';

const StatusBarChangeStory = ({
  property,
}: {
  property: 'backgroundColor' | 'hidden' | 'style:dark' | 'style:light' | 'translucent';
}) => {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (property === 'backgroundColor') {
      ExpoStatusBar.setStatusBarBackgroundColor('#f00', false);
    } else if (property === 'hidden') {
      ExpoStatusBar.setStatusBarHidden(true);
    } else if (property === 'style:dark') {
      ExpoStatusBar.setStatusBarStyle('dark');
    } else if (property === 'style:light') {
      ExpoStatusBar.setStatusBarStyle('light');
    } else if (property === 'translucent') {
      ExpoStatusBar.setStatusBarTranslucent(false);
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
