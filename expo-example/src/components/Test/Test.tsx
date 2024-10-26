import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Localization from 'expo-localization';
import { useColorScheme } from 'react-native';

const Test = ({ variant = 'primary' }: { variant: 'primary' | 'secondary' }) => {
  const theme = useColorScheme(); // 'light' or 'dark'
  const backgroundColor = theme === 'dark' ? '#333' : '#FFF';
  const textColor = theme === 'dark' ? '#FFF' : '#333';

  // Localization data
  const locale = Localization.locale;
  const [language, country] = locale.split('-'); // Expo uses '-' as the separator

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {variant === 'secondary' && (
        <View style={styles.infoContainer}>
          <Text style={[styles.text, { color: textColor }]}>SECONDARY VARIANT</Text>
        </View>
      )}
      <View style={styles.infoContainer}>
        <MaterialIcons name="record-voice-over" size={24} color={textColor} />
        <Text style={[styles.text, { color: textColor }]}>Language: {language}</Text>
      </View>

      <View style={styles.infoContainer}>
        <MaterialIcons name="place" size={24} color={textColor} />
        <Text style={[styles.text, { color: textColor }]}>Country: {country}</Text>
      </View>

      <View style={styles.infoContainer}>
        <MaterialIcons name="brightness-4" size={24} color={textColor} />
        <Text style={[styles.text, { color: textColor }]}>Theme: {theme || 'undefined'}</Text>
      </View>

      {Updates.updateId ? (
        <>
          <View style={styles.infoContainer}>
            <MaterialIcons name="mobile-friendly" size={24} color={textColor} />
            <Text style={[styles.text, { color: textColor }]}>
              Runtime Version: {Updates.runtimeVersion}
            </Text>
          </View>

          <View style={styles.infoContainer}>
            <MaterialIcons name="update" size={24} color={textColor} />
            <Text style={[styles.text, { color: textColor }]}>
              Update (
              {Updates.createdAt?.toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
              ) with ID:
            </Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={[styles.text, { color: textColor }]}>{Updates.updateId}</Text>
          </View>
        </>
      ) : null}
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
    paddingHorizontal: 20, // Ensures padding is consistent horizontally
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  text: {
    fontSize: 16,
    marginLeft: 10,
  },
});

export default Test;
