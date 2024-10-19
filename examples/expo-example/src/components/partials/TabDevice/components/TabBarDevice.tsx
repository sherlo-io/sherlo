import React from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import Text from "../../../base/Text/Text";
import { dimensions } from "../../../../theme/dimensions";
import { RoomsAirPurifierItemProps, RoomsHeatingItemProps } from "../types";

interface HeaderControllProps {
  goToPage: (page: number) => void;
  activePage: number;
  DATA: (RoomsHeatingItemProps | RoomsAirPurifierItemProps)[];
}

export const TabBarDevice = ({
  goToPage,
  activePage,
  DATA,
}: HeaderControllProps) => {
  return (
    <FlatList
      data={DATA}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => {
            goToPage(item.id);
          }}
        >
          {item.id === activePage ? (
            <Text variant="headline">{item.roomName}</Text>
          ) : (
            <Text variant="headlineInactive">{item.roomName}</Text>
          )}
        </TouchableOpacity>
      )}
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      onEndReachedThreshold={0.1}
      onStartReachedThreshold={0.25}
      ItemSeparatorComponent={() => <View style={{ width: 34 }} />}
      style={styles.container}
    />
  );
};
const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    marginVertical: dimensions.tabsGap,
  },
});
