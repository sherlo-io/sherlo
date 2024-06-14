import React from 'react';
import InfoDisplayBox from './components/InfoDisplayBox';
import { View, StyleSheet } from 'react-native';
import { dimensions } from '../../../theme/dimensions';
import { breakIntoLines } from '../../../utils/breakIntoLines';

interface infoDisplayProps {
  variant: 'Heating' | 'Air Purifier';
  airHumidity?: number;
  actualTemperature?: number;
  pm?: number;
  dust?: number;
}

const InfoDisplay = ({ variant, airHumidity, actualTemperature, pm, dust }: infoDisplayProps) => {
  return variant === 'Heating' ? (
    <View style={[styles.container]}>
      <InfoDisplayBox
        variant="info"
        name={dimensions.size === 'M' ? breakIntoLines('Air humidity') : 'Air humidity'}
        value={`${airHumidity}%`}
      />
      <InfoDisplayBox variant="info" name="Actual temperature" value={`${actualTemperature}°C`} />
      <InfoDisplayBox variant="switch" />
    </View>
  ) : (
    <View style={styles.container}>
      <InfoDisplayBox variant="info" name="PM 2.5" value={`${pm} μg/m3`} />
      <InfoDisplayBox variant="info" name="Dust" value={`${dust} μg/m3`} />
    </View>
  );
};

export default InfoDisplay;

const styles = StyleSheet.create({
  container: {
    // ustawić to na ekranie nie w komponencie
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: dimensions.infoDisplayGap,
  },
});
