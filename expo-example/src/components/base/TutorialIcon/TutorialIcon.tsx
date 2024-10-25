import React from 'react';
import { View, StyleSheet } from 'react-native';
import Connect from '../Icon/Icons/Connect';
import SaveEnergy from '../Icon/Icons/SaveEnergy';
import { shadows } from '../../../theme/shadows';

interface TutorialIconProps {
  appState: string;
}

const TutorialIcon = ({ appState }: TutorialIconProps) => {
  return (
    <View style={[styles.iconContainer, shadows.black]}>
      {appState === 'tutorial1' ? <Connect /> : <SaveEnergy />}
    </View>
  );
};

export default TutorialIcon;

const styles = StyleSheet.create({
  iconContainer: {
    // flex: 0.6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: 206.525,
    height: 206.525,
    borderRadius: 67.492,
    backgroundColor: '#16171A',
  },
});
