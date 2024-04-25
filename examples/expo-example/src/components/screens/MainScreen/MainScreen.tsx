import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { Footer } from 'components/partials';

import Header from '../../partials/Header/Header';

import TabComponent from '../../partials/TabComponent/TabComponent';
import { RadialBackground } from 'components/screens/MainScreen/RadialBackground';

export const MainScreen = () => {
  const [activePage, setActivePage] = useState(0);

  return (
    <>
      <RadialBackground color={activePage === 0 ? 'green' : 'blue'} />
      <SafeAreaView style={styles.container}>
        <Header
          avatarSource={require('../../../../assets/Images/AvatarImage.png')}
          userName="User"
        />
        <TabComponent activePage={activePage} setActivePage={setActivePage} />
      </SafeAreaView>
      <Footer />
    </>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
});
