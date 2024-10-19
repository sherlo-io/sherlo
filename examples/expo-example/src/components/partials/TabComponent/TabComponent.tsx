import React, { useRef } from 'react';
import PagerView from 'react-native-pager-view';
import TabBar from './TabBar/TabBar';
import Tabs from './Tabs/Tabs';

interface TabComponentProps {
  activePage: number;
  setActivePage: React.Dispatch<React.SetStateAction<number>>;
}

const TabComponent: React.FC<TabComponentProps> = ({ activePage, setActivePage }) => {
  const pagerRef = useRef<PagerView>(null);

  const goToPage = (page: number) => {
    pagerRef.current?.setPage(page);
  };

  const handlePageChange = (event: any) => {
    setActivePage(event.nativeEvent.position);
  };

  return (
    <>
      <TabBar goToPage={goToPage} activePage={activePage} />
      <Tabs pagerRef={pagerRef} handlePageChange={handlePageChange} initialPage={activePage} />
    </>
  );
};

export default TabComponent;
