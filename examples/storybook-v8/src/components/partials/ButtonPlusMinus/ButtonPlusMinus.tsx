import React from "react";

import { colors } from "../../../theme/colors";
import { shadows } from "../../../theme/shadows";

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Icon from "../../base/Icon/Icon";

const ButtonPlusMinus = () => {
  return (
    <View style={shadows.white}>
      <View style={shadows.black}>
        <View style={styles.container}>
          <TouchableOpacity style={{ flex: 1 }}>
            <LinearGradient
              colors={colors.buttonPlusMinusGradient}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 0 }}
              style={styles.button}
            >
              <Icon name="minus" size="medium" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button}>
            <Icon name="plus" size="medium" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ButtonPlusMinus;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 67.492,
    backgroundColor: colors.buttonPlusMinusBackground,
  },
  button: {
    flex: 1,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
