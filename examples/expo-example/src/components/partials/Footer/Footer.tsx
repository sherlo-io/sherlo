import React from "react";
import { View, StyleSheet } from "react-native";

import { colors } from "../../../theme/colors";
import { dimensions } from "../../../theme/dimensions";
import IconButton from "../../base/IconButton/IconButton";

 const Footer = () => {
  return (
    <View style={styles.footer}>
      <View style={styles.iconContainer}>
        <IconButton name="splotch" size="big" />
      </View>
      <View style={styles.iconContainer}>
        <IconButton name="cog" size="big" />
      </View>
      <View style={styles.iconContainer}>
        <IconButton name="plusBox" size="big" />
      </View>
      <View style={styles.iconContainer}>
        <IconButton name="account" size="big" />
      </View>
    </View>
  );
};

export default Footer

const styles = StyleSheet.create({
  footer: {
    height: dimensions.footerHeight,
    flexDirection: "row",
    backgroundColor: colors.footerBackground,
    borderTopWidth: 0.675,
    borderTopColor: colors.footerBorder,
  },
  iconContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
