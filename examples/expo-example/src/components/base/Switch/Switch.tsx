import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Switch as SwitchComponent } from "react-native-switch";
import { colors } from "../../../theme/colors";

const Switch = () => {
  const [switchState, setSwitchState] = useState(false);
  const styles = StyleSheet.create({
    container: {
      width: 45,
      height: 29.7,
      borderRadius: 50,
      borderWidth: 1.2,
      borderColor: switchState ? colors.activeLow : colors.grayLow,
    },
  });

  return (
    <View style={styles.container}>
      <SwitchComponent
        value={switchState}
        onValueChange={setSwitchState}
        disabled={false}
        circleSize={20.25}
        barHeight={27}
        circleBorderWidth={0}
        backgroundActive={"transparent"}
        backgroundInactive={"transparent"}
        circleActiveColor={colors.activeHigh}
        circleInActiveColor={colors.grayHigh}
        renderActiveText={false}
        renderInActiveText={false}
        switchLeftPx={2.5}
        switchRightPx={2.5}
        switchWidthMultiplier={2.1}
      />
    </View>
  );
};

export default Switch