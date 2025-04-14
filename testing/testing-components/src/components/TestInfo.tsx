import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { InfoItem } from './InfoItem';

const getContrastTextColor = (backgroundColor: string | undefined) => {
  if (!backgroundColor) return undefined;

  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.5 ? '#000000' : '#ffffff';
};

const TestScreen = ({
  backgroundColor,
  colorName,
  locale,
}: {
  backgroundColor?: string;
  colorName?: string;
  locale?: string;
}) => {
  const theme = useColorScheme();
  const [language, country] = locale?.split('-') ?? [];
  const textColor = getContrastTextColor(backgroundColor);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <InfoItem iconName="voice" text={`Language: ${language}`} textColor={textColor} />
      <InfoItem iconName="location" text={`Country: ${country}`} textColor={textColor} />
      <InfoItem iconName="theme" text={`Theme: ${theme}`} textColor={textColor} />
      {colorName && (
        <InfoItem iconName="palette" text={`Color: ${colorName}`} textColor={textColor} />
      )}
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
