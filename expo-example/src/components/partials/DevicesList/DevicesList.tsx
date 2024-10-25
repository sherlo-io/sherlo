import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MasonryFlashList } from '@shopify/flash-list';
import DevicesListItem, { DevicesListItemProps } from './DevicesListItem/DevicesListItem';
import useScrollOverlays from '../../../hooks/useScrollOverlays';
import { dimensions } from '../../../theme/dimensions';

export interface DevicesListProps {
  DATA: DevicesListItemProps[];
}

const DevicesList = ({ DATA }: DevicesListProps) => {
  const { overlays, onScroll } = useScrollOverlays();

  return (
    <View style={styles.container}>
      <MasonryFlashList
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={20}
        onScroll={onScroll}
        numColumns={2}
        data={DATA}
        renderItem={({ item, index }) => {
          const isSecond = index === 1;
          const isSecondToLast = index === DATA.length - 2;

          return (
            <View style={[styles.itemContainer, index % 2 ? styles.gapLeft : styles.gapRight]}>
              {isSecond && <View style={styles.offsetBox} />}

              <DevicesListItem key={item.id} id={item.id} />

              {isSecondToLast && <View style={styles.offsetBox} />}
            </View>
          );
        }}
      />
      {overlays}
    </View>
  );
};

export default DevicesList;

const styles = StyleSheet.create({
  offsetBox: {
    height: dimensions.deviceListoffsetBox,
  },
  itemContainer: {
    marginBottom: dimensions.deviceListGap,
    paddingHorizontal: dimensions.deviceListGap / 2,
  },
  container: {
    flex: 1,
    paddingHorizontal: dimensions.listItemMargin,
  },
  gapLeft: {
    paddingLeft: dimensions.deviceListGap / 2,
  },
  gapRight: {
    paddingRight: dimensions.deviceListGap / 2,
  },
});
