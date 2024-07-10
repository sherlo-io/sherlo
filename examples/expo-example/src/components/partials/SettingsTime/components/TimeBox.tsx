import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Text from '../../../base/Text/Text';
import { dimensions } from '../../../../theme/dimensions';
import IconButton from '../../../base/IconButton/IconButton';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

interface TimeBoxProps {
  variant: 'from' | 'to';
}

const TimeBox = ({ variant }: TimeBoxProps) => {
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [selectedHour, setSelectedHour] = useState(new Date('2021-06-01T12:00:00.000Z'));

  const handleConfirm = (date: Date) => {
    setSelectedHour(date);
    setDatePickerVisibility(false);
  };

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const formattedTime = selectedHour.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.container]}>
      <Text variant="time">{`${variant === 'from' ? 'from' : 'To'}: ${formattedTime}`}</Text>

      <IconButton name="arrowDown" size="small" onPress={showDatePicker} />

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="time"
        onConfirm={handleConfirm}
        onCancel={hideDatePicker}
      />
    </View>
  );
};

export default TimeBox;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: dimensions.timeBoxGap,
    padding: dimensions.timeBoxPadding,
  },
});
