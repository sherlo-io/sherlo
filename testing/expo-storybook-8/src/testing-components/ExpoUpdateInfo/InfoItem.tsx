import React from 'react';
import { Text, View, StyleSheet, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export const InfoItem: React.FC<{
  iconName?: React.ComponentProps<typeof MaterialIcons>['name'];
  text?: string;
  textColor?: string;
}> = ({ iconName, text, textColor }) => {
  const theme = useColorScheme();
  const calculatedTextColor = textColor || (theme === 'dark' ? '#FFF' : '#333');
  return (
    <View style={styles.infoContainer}>
      {iconName ? <MaterialIcons name={iconName} size={24} color={textColor} /> : null}
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
