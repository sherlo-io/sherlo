import React from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const IconComponents: Record<string, React.FC<{ color: string }>> = {
  mobile: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 2H7C5.89543 2 5 2.89543 5 4V20C5 21.1046 5.89543 22 7 22H17C18.1046 22 19 21.1046 19 20V4C19 2.89543 18.1046 2 17 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path d="M12 18H12.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  ),
  update: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 4V10H17M1 20V14H7M20.49 15C19.2214 19.0905 15.3454 22 10.8095 22C6.27372 22 2.39766 19.0905 1.12906 15M3.51 9C4.77859 4.90951 8.65465 2 13.1905 2C17.7263 2 21.6023 4.90951 22.8709 9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),
  font: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 16 16" fill="none">
      <Path d="M0 0h16v4h-2V2H9v12h3v2H4v-2h3V2H2v2H0V2z" fill={color} fillRule="evenodd" />
    </Svg>
  ),
  voice: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1C11.2044 1 10.4413 1.31607 9.87868 1.87868C9.31607 2.44129 9 3.20435 9 4V12C9 12.7956 9.31607 13.5587 9.87868 14.1213C10.4413 14.6839 11.2044 15 12 15C12.7956 15 13.5587 14.6839 14.1213 14.1213C14.6839 13.5587 15 12.7956 15 12V4C15 3.20435 14.6839 2.44129 14.1213 1.87868C13.5587 1.31607 12.7956 1 12 1Z"
        stroke={color}
        strokeWidth="2"
      />
      <Path
        d="M19 10V12C19 14.1217 18.1571 16.1566 16.6569 17.6569C15.1566 19.1571 13.1217 20 11 20"
        stroke={color}
        strokeWidth="2"
      />
      <Path d="M12 19V23M8 23H16" stroke={color} strokeWidth="2" />
    </Svg>
  ),
  location: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z"
        stroke={color}
        strokeWidth="2"
      />
      <Path
        d="M12 2C7.58172 2 4 5.58172 4 10C4 15.25 12 22 12 22C12 22 20 15.25 20 10C20 5.58172 16.4183 2 12 2Z"
        stroke={color}
        strokeWidth="2"
      />
    </Svg>
  ),
  theme: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8V16Z" fill={color} />
      <Path
        d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM12 4V8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16V20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4Z"
        fill={color}
      />
    </Svg>
  ),
  palette: ({ color }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.1046 22 14 21.1046 14 20V18.97C14 18.42 14.45 17.97 15 17.97H17.52C19.99 17.97 22 15.96 22 13.49C22 7.12 17.52 2 12 2ZM7.5 12C6.67157 12 6 11.3284 6 10.5C6 9.67157 6.67157 9 7.5 9C8.32843 9 9 9.67157 9 10.5C9 11.3284 8.32843 12 7.5 12ZM11 8C10.1716 8 9.5 7.32843 9.5 6.5C9.5 5.67157 10.1716 5 11 5C11.8284 5 12.5 5.67157 12.5 6.5C12.5 7.32843 11.8284 8 11 8ZM15 8C14.1716 8 13.5 7.32843 13.5 6.5C13.5 5.67157 14.1716 5 15 5C15.8284 5 16.5 5.67157 16.5 6.5C16.5 7.32843 15.8284 8 15 8ZM18.5 12C17.6716 12 17 11.3284 17 10.5C17 9.67157 17.6716 9 18.5 9C19.3284 9 20 9.67157 20 10.5C20 11.3284 19.3284 12 18.5 12Z"
        fill={color}
      />
    </Svg>
  ),
};

export const InfoItem: React.FC<{
  iconName?: 'mobile' | 'update' | 'voice' | 'location' | 'theme' | 'palette' | 'font';
  text?: string;
  textColor?: string;
}> = ({ iconName, text, textColor }) => {
  const theme = useColorScheme();
  const calculatedTextColor = textColor || (theme === 'dark' ? '#FFF' : '#333');
  const IconComponent = iconName ? IconComponents[iconName] : null;

  return (
    <View style={styles.infoContainer}>
      {IconComponent && <IconComponent color={calculatedTextColor} />}
      <Text style={[styles.text, { color: calculatedTextColor }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
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

export default InfoItem;
