import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import Text from 'components/base/Text';
import TutorialIcon from 'components/base/TutorialIcon/TutorialIcon';
import TutorialControl from 'components/partials/TutorialControll/TutorialControl';

interface TutorialScreenProps {
  variant: 'connect' | 'saveEnergy';
  setAppState: (value: string) => void;
}

export const TutorialScreen = ({ variant, setAppState }: TutorialScreenProps) => {
  return (
    <>
      <SafeAreaView style={styles.container}>
        <TutorialIcon appState={variant} />
        <View style={styles.textContainer}>
          <Text variant="tutorialHeadline">
            {variant === 'connect' ? 'Connect' : 'Save Energy'}
          </Text>
          <Text variant="tutorialSubtitle">
            {variant === 'connect'
              ? 'Connect and manage \n all of your smart home devices \n in just few simple steps'
              : 'Track energy consumption \n every day, get complete stats,\n save money'}
          </Text>
        </View>
        <TutorialControl appState={variant} setAppState={setAppState} />
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 0.4,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
});
