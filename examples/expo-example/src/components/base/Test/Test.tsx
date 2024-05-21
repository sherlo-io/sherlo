import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import * as Localization from 'expo-localization';
import { useColorScheme } from 'react-native';

const Test = () => {
  const theme = useColorScheme(); // 'light' or 'dark'

  // Localization data
  const locale = Localization.locale;
  const [language, country] = locale.split('-'); // Expo uses '-' as the separator

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Locale: {locale}</Text>
      <Text style={styles.text}>Language: {language}</Text>
      <Text style={styles.text}>Country: {country}</Text>
      <Text style={styles.text}>Theme: {theme || 'undefined'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
});

export default Test;
