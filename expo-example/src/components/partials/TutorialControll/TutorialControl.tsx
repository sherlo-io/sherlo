import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Text from '../../base/Text/Text';
import { Dot } from '../../base/Icon/Icons/Dot';
import { colors } from '../../../theme/colors';

interface TutorialControlProps {
  appState: string;
  setAppState: (value: string) => void;
}

const TutorialControl = ({ appState, setAppState }: TutorialControlProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.dotContainer}>
        <Dot fill={appState === 'tutorial1' ? true : false} />

        <Dot fill={appState === 'tutorial2' ? true : false} />
        <Dot fill={false} />
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setAppState(appState === 'tutorial1' ? 'tutorial2' : 'main')}
      >
        <Text variant="tutorialButton">Skip</Text>
      </TouchableOpacity>
    </View>
  );
};

export default TutorialControl;

const styles = StyleSheet.create({
  container: {
    flex: 0.2,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 149.115,
  },
  dotContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  button: {
    width: '100%',
    padding: 17.042,
    alignItems: 'center',
    borderRadius: 17.219,
    borderWidth: 1.722,
    borderColor: colors.tutorialBtnBorder,
  },
});
