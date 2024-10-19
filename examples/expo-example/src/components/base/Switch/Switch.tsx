import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch as SwitchComponent } from 'react-native-switch';
import { colors } from '../../../theme/colors';
import { dimensions } from 'theme/dimensions';

export interface SwitchProps {
  state: boolean;
  setState: (newState: boolean) => void;
}

const Switch = ({ state, setState }: SwitchProps) => {
  const styles = StyleSheet.create({
    container: {
      width: dimensions.switchWidth,
      height: dimensions.switchHeight,
      borderRadius: 50,
      borderWidth: dimensions.switchBorderWidth,
      borderColor: state ? colors.activeLow : colors.grayLow,
    },
  });

  return (
    <View style={styles.container}>
      <SwitchComponent
        value={state}
        onValueChange={setState}
        disabled={false}
        circleSize={dimensions.switchCircleSize}
        barHeight={dimensions.switchBarHaight}
        circleBorderWidth={0}
        backgroundActive={'transparent'}
        backgroundInactive={'transparent'}
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

export default Switch;
