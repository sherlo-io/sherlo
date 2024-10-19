import React from 'react';
import useScrollOverlays from '../../../hooks/useScrollOverlays';
import { FlashList } from '@shopify/flash-list';
import { RoomsListItem, RoomsListItemProps } from './RoomsListItem';

export interface RoomListProps {
  DATA: RoomsListItemProps[];
}

const RoomsList = ({ DATA }: RoomListProps) => {
  const { overlays, onScroll } = useScrollOverlays();

  return (
    <>
      <FlashList
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={20}
        onScroll={onScroll}
        data={DATA}
        renderItem={({ item }) => (
          <RoomsListItem id={item.id} activeDevicesCount={item.activeDevicesCount} />
        )}
      />
      {overlays}
    </>
  );
};

export default RoomsList;
