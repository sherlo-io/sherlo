import React from 'react';
import { StyleSheet, View } from 'react-native';
import CardItem from '../../CardItem/CardItem';
import Text from '../../../base/Text/Text';
import Switch from '../../../base/Switch/Switch';
import { dimensions } from '../../../../theme/dimensions';
import IconButton from '../../../base/IconButton/IconButton';
import { getDeviceData } from './DevicesListItem.data';

export interface DevicesListItemProps {
  id: string;
  onPress?: () => void;
}

const DevicesListItem = ({ id, onPress }: DevicesListItemProps) => {
  const { imageKey, roomName, deviceName } = getDeviceData(id);

  return (
    <View style={styles.shape}>
      <CardItem withDimmedHeader={true} imageKey={imageKey}>
        <View>
          <View style={styles.textIconContainer}>
            <View style={styles.textContainer}>
              <Text variant="headline">{deviceName}</Text>
            </View>

            <IconButton name="arrowRight" size="small" onPress={onPress} />
          </View>
          <Text variant="subtitle">{roomName}</Text>
        </View>
        <Switch />
      </CardItem>
    </View>
  );
};

export default DevicesListItem;

const styles = StyleSheet.create({
  shape: {
    height: dimensions.devicesListItemHeight,
  },
  textContainer: {
    flexShrink: 1,
  },
  textIconContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
