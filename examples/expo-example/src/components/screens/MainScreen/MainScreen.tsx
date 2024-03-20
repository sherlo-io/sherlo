import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { Footer } from 'components/partials';

import Header from '../../partials/Header/Header';
import Background from '../../base/Background/Background';
import TabComponent from '../../partials/TabComponent/TabComponent';

export const MainScreen = () => {
  const [activePage, setActivePage] = useState(0);

  return (
    <>
      <Background color={activePage === 0 ? 'green' : 'blue'} />
      <SafeAreaView style={styles.container}>
        <Header
          avatarSource={require('../../../../assets/Images/GabeTheDog.jpeg')}
          userName="Jakupik"
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
