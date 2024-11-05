import React from 'react';
import { Text, View, StyleSheet, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Localization from 'expo-localization';
import { useColorScheme } from 'react-native';

const InfoItem: React.FC<{
  iconName?: React.ComponentProps<typeof MaterialIcons>['name'];
  text?: string;
}> = ({ iconName, text }) => {
  const theme = useColorScheme();
  const textColor = theme === 'dark' ? '#FFF' : '#333';
  return (
    <View style={styles.infoContainer}>
      {iconName ? <MaterialIcons name={iconName} size={24} color={textColor} /> : null}
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
};

const TestScreen = () => {
  const theme = useColorScheme();
  const [language, country] = Localization.locale.split('-');

  return (
    <View style={[styles.container]}>
      <InfoItem iconName="record-voice-over" text={`Language: ${language}`} />

      <InfoItem iconName="place" text={`Country: ${country}`} />

      <InfoItem iconName="brightness-4" text={`Theme: ${theme}`} />

      {Updates.updateId ? (
        <>
          <InfoItem
            iconName="mobile-friendly"
            text={`Runtime Version: ${Updates.runtimeVersion}`}
          />
          <InfoItem
            iconName="update"
            text={`Update (${Updates.createdAt?.toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}) with ID:`}
          />
          <InfoItem text={Updates.updateId} />
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
    paddingHorizontal: 20,
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

export default TestScreen;
