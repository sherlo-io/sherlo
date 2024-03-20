import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from '../../../base/Text/Text';
import { dimensions } from '../../../../theme/dimensions';

interface TabBarProps {
  goToPage: (page: number) => void;
  activePage: number;
}

const TabBar = ({ goToPage, activePage }: TabBarProps) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => {
          goToPage(0);
        }}
      >
        <Text variant={activePage === 0 ? 'headline' : 'headlineInactive'}>Devices</Text>
        <Text variant="subtitle">18 Active devices</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          goToPage(1);
        }}
      >
        <Text variant={activePage === 1 ? 'headline' : 'headlineInactive'}>Rooms</Text>
        <Text variant="subtitle">4 Rooms</Text>
      </TouchableOpacity>

      <TouchableOpacity>
        <Text variant="headlineInactive">Users</Text>
        <Text variant="subtitle">5 Users</Text>
      </TouchableOpacity>
    </View>
  );
};
export default TabBar;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: dimensions.tabsGap,
    marginHorizontal: dimensions.mainHeaderHMargin,
  },
});
