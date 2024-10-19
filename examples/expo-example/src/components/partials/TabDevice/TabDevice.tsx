import React, { useRef, useState } from 'react';
import PagerView from 'react-native-pager-view';
import { TabBarDevice } from './components/TabBarDevice';
import { TabsDevice } from './components/TabsDevice';
import { ROOMS_AIR_PURIFIER_DATA, ROOMS_HEATING_DATA } from '../../../fixtures/devicesRooms';

interface TabDeviceProps {
  deviceName: string;
}

export const TabDevice = ({ deviceName }: TabDeviceProps) => {
  const [activePage, setActivePage] = useState<number>(0);
  const pagerRef = useRef<PagerView>(null);

  const goToPage = (page: number) => {
    pagerRef.current?.setPage(page);
  };

  const handlePageChange = (event: any) => {
    setActivePage(event.nativeEvent.position);
  };
  let DATA;
  switch (deviceName) {
    case 'Heating':
      DATA = ROOMS_HEATING_DATA;
      break;

    case 'Air Purifier':
      DATA = ROOMS_AIR_PURIFIER_DATA;
      break;

    default:
      throw new Error(`invalid device name: ${deviceName}`);
  }

  return (
    <>
      <TabBarDevice goToPage={goToPage} activePage={activePage} DATA={DATA} />
      <TabsDevice
        deviceName={deviceName}
        pagerRef={pagerRef}
        handlePageChange={handlePageChange}
        DATA={DATA}
      />
    </>
  );
};
