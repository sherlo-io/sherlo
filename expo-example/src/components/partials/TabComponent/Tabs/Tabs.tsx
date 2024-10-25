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
      <DevicesList key="devices" DATA={DEVICES_DATA} />
      <RoomsList key="rooms" DATA={ROOMS_DATA} />
    </PagerView>
  );
};

export default Tabs;

const styles = StyleSheet.create({
  pagerView: {
    flex: 1,
  },
});
