import React from 'react';
import SettingsButton from '../../SettingsButton/SettingsButton';
import InfoDisplay from '../../InfoDisplay/InfoDisplay';
import SettingsTime from '../../SettingsTime/SettingsTime';
import { StyleSheet, View } from 'react-native';
import { RoomsAirPurifierItemProps, RoomsHeatingItemProps } from '../types';
import PagerView from 'react-native-pager-view';
import ButtonPlusMinus from '../../ButtonPlusMinus/ButtonPlusMinus';

interface TabsDeviceProps {
  deviceName: 'Heating' | 'Air Purifier';
  pagerRef: React.RefObject<PagerView>;
  handlePageChange: (event: any) => void;
  DATA: RoomsHeatingItemProps[] | RoomsAirPurifierItemProps[];
}

export const TabsDevice = ({ deviceName, pagerRef, handlePageChange, DATA }: TabsDeviceProps) => {
  return (
    <PagerView
      style={styles.pagerView}
      initialPage={0}
      ref={pagerRef}
      onPageSelected={handlePageChange}
      pageMargin={40}
    >
      {DATA.map((item) => (
        <View style={styles.infoContainer}>
          <View style={styles.mockmiddlecomponent} />
          <SettingsButton />
          <View style={styles.statsContainer}>
            {deviceName === 'Heating' && (
              <>
                <ButtonPlusMinus />
                <InfoDisplay
                  variant={deviceName}
                  airHumidity={(item as RoomsHeatingItemProps).airHumidity}
                  actualTemperature={(item as RoomsHeatingItemProps).actualTemperature}
                />
              </>
            )}
            {deviceName === 'Air Purifier' && (
              <>
                <InfoDisplay
                  variant={deviceName}
                  pm={(item as RoomsAirPurifierItemProps).pm}
                  dust={(item as RoomsAirPurifierItemProps).dust}
                />
                <SettingsTime />
              </>
            )}
          </View>
        </View>
      ))}
    </PagerView>
  );
};

const styles = StyleSheet.create({
  pagerView: {
    flex: 1,
  },
  infoContainer: {
    flex: 1,
  },
  statsContainer: {
    flex: 1,
    justifyContent: 'space-evenly',
  },
  mockmiddlecomponent: {
    height: 400,
    backgroundColor: 'lightblue',
  },
});
