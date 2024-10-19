import React from 'react';
import { StyleSheet, View } from 'react-native';

import Text from '../../../base/Text/Text';
import { dimensions } from '../../../../theme/dimensions';
import IconButton from '../../../base/IconButton/IconButton';
import { getRoomData } from './RoomsListItem.data';
import CardItem from '../../CardItem/CardItem';

export interface RoomsListItemProps {
  id: string;
  activeDevicesCount: number;
  onArrowPress?: () => void;
}

const RoomsListItem = ({ id, activeDevicesCount, onArrowPress }: RoomsListItemProps) => {
  const { imageKey, roomName } = getRoomData(id);

  return (
    <View style={styles.shape}>
      <CardItem withDimmedHeader={false} imageKey={imageKey}>
        <View>
          <Text variant="headline">{roomName}</Text>
          <Text variant="subtitle">{`${activeDevicesCount} Active devices`}</Text>
        </View>
        <IconButton name="arrowRight" size="medium" onPress={onArrowPress} isActive={true} />
      </CardItem>
    </View>
  );
};

export default RoomsListItem;

const styles = StyleSheet.create({
  shape: {
    height: dimensions.roomsListItemHeight,
    marginBottom: dimensions.roomsListItemMargin,
    marginHorizontal: dimensions.listItemMargin,
  },
});
