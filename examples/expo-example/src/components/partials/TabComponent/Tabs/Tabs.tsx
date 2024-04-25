import React from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import DevicesList from '../../DevicesList/DevicesList';
import RoomsList from '../../RoomsList/RoomsList';
import { DEVICES_DATA } from '../../../../fixtures/devices';
import { ROOMS_DATA } from '../../../../fixtures/rooms';

interface TabsProps {
  pagerRef?: React.RefObject<PagerView>;
  handlePageChange: (event: any) => void;
  initialPage?: number;
}

const Tabs = ({ pagerRef, handlePageChange, initialPage }: TabsProps) => {
  return (
    <PagerView
      style={styles.pagerView}
      initialPage={initialPage}
      ref={pagerRef}
      onPageSelected={handlePageChange}
      pageMargin={40}
    >
      <View key="devices">
        <DevicesList DATA={DEVICES_DATA} />
      </View>
      <View key="rooms">
        <RoomsList DATA={ROOMS_DATA} />
      </View>
    </PagerView>
  );
};

export default Tabs;

const styles = StyleSheet.create({
  pagerView: {
    flex: 1,
  },
});
