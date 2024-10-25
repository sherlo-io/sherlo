import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import Footer from '../../partials/Footer/Footer';

import Header from '../../partials/Header/Header';
import { TabDevice } from '../../partials/TabDevice/TabDevice';

interface ControllScreenProps {
  deviceName: 'Heating' | 'Air Purifier';
  setAppState: (value: string) => void;
}
export const ControlScreen = ({ deviceName, setAppState }: ControllScreenProps) => {
  return (
    <>
      <SafeAreaView style={styles.margin}>
        <Header
          avatarSource={require('../../../../assets/Images/AvatarImage.png')}
          title={deviceName}
          onBackPress={() => console.log('Pressed')}
        />
        <TabDevice deviceName={deviceName} />
      </SafeAreaView>
      <Footer />
    </>
  );
};

const styles = StyleSheet.create({
  margin: {
    flex: 1,
    marginHorizontal: 25,
  },
});
