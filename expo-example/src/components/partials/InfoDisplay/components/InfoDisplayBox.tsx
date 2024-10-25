import React, { useDeferredValue } from "react";
import { View, StyleSheet } from "react-native";
import  Text  from "../../../base/Text/Text";
import  Switch  from "../../../base/Switch/Switch";
import { colors } from "../../../../theme/colors";
import { dimensions } from "../../../../theme/dimensions";
import { shadows } from "../../../../theme/shadows";
// import { breakIntoLines } from "../utils/breakIntoLines"

type InfoDisplayBoxProps =
  | {
      name: string;
      variant: "info";
      value: string;
    }
  | { variant: "switch" };

const InfoDisplayBox = (props: InfoDisplayBoxProps) => {
  return (
    <View
      style={[
        styles.container,
        shadows.black,
        props.variant === "switch" ? styles.switch : styles.text,
      ]}
    >
      {props.variant === "switch" ? (
        <>
          <Text variant="displayBox">Auto</Text>
          <Switch />
        </>
      ) : (
        <>
          <Text variant="displayBox">{props.name}</Text>
          <Text variant="headline">{props.value}</Text>
        </>
      )}
    </View>
  );
};

export default InfoDisplayBox

const styles = StyleSheet.create({
  container: {
    height: "100%",
    padding: dimensions.infoDisplayBoxPadding,
    backgroundColor: colors.infoDisplayBoxBackground,

    borderRadius: 16.198,
    borderWidth: 0.675,
    borderColor: colors.infoDisplayBoxBorder,
  },
  switch: {
    flex: 0.66,
    justifyContent: "space-between",
  },
  text: {
    flex: 1,
  },
});
