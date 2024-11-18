import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as Localization from 'expo-localization';
import { useColorScheme } from 'react-native';
import { InfoItem } from './InfoItem';

const TestScreen = () => {
  const theme = useColorScheme();
  const [language, country] = Localization.locale.split('-');

  return (
    <View style={[styles.container]}>
      <InfoItem iconName="record-voice-over" text={`Language: ${language}`} />

      <InfoItem iconName="place" text={`Country: ${country}`} />

      <InfoItem iconName="brightness-4" text={`Theme: ${theme}`} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingHorizontal: 20,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  text: {
    fontSize: 12,
    marginLeft: 10,
  },
});

export default TestScreen;
