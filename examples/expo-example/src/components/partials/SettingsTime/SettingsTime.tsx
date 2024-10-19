import React from 'react';
import { View, StyleSheet } from 'react-native';
import TimeBox from './components/TimeBox';
import { colors } from '../../../theme/colors';

const SettingsTime = () => {
  return (
    <View style={styles.container}>
      <TimeBox variant="from" />
      <View
        style={{
          borderRightWidth: 0.675,
          borderColor: colors.settingsTimeBorder,
        }}
      />
      <TimeBox variant="to" />
    </View>
  );
};

export default SettingsTime;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',

    borderRadius: 5.4,
    borderWidth: 0.675,
    borderColor: colors.settingsTimeBorder,

    overflow: 'hidden',
  },
});
