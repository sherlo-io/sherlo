import React from 'react';
import { View, StyleSheet } from 'react-native';
import { dimensions } from '../../../theme/dimensions';
import { colors } from '../../../theme/colors';
import { shadows } from '../../../theme/shadows';
import IconButton from '../../base/IconButton/IconButton';

const SettingsButton = () => {
  return (
    <View style={[styles.container, shadows.black]}>
      <IconButton name="sliders" size="big" />
    </View>
  );
};

export default SettingsButton;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: dimensions.settingsButtonWidth,
    height: dimensions.settingsButtonHeight,
    backgroundColor: colors.settingsButtonBackground,

    borderRadius: 67.492,
    borderWidth: 0.675,
    borderColor: colors.settingsButtonBorder,

    position: 'absolute',
    right: -(dimensions.controllScreenMargin + dimensions.settingsButtonWidth / 4),

    paddingLeft: dimensions.settingsButtonPadding,
  },
});
