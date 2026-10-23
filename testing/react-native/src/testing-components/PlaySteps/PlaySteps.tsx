import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

const NAMES = ['Ada', 'Bo', 'Cy'];

/**
 * A tiny app with no address for its last screen: a tab opens a list, a row opens a chat. The rows
 * share one testID, as a real list's rows do.
 */
export default function PlaySteps() {
  const [screen, setScreen] = useState<'home' | 'list' | {chat: string}>('home');

  if (typeof screen === 'object') {
    return (
      <View style={[styles.fill, styles.chat]}>
        <Text testID="chat.title" style={styles.title}>
          Chat with {screen.chat}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
        {screen === 'home' ? (
          <Text style={styles.title}>Discover</Text>
        ) : (
          NAMES.map(name => (
            <TouchableOpacity
              key={name}
              testID="row"
              style={styles.row}
              onPress={() => setScreen({chat: name})}>
              <Text style={styles.rowText}>{name}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
      <View style={styles.tabBar}>
        <Pressable
          testID="tab.list"
          accessibilityLabel="Connections"
          unstable_pressDelay={80}
          onPress={() => setScreen('list')}
          style={styles.tab}>
          <Text>Connections</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1, alignSelf: 'stretch'},
  chat: {backgroundColor: '#d8f0ff', alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 28, textAlign: 'center', marginTop: 40},
  row: {padding: 24, borderBottomWidth: 1, borderColor: '#ccc'},
  rowText: {fontSize: 20},
  tabBar: {height: 80, borderTopWidth: 1, borderColor: '#ccc', flexDirection: 'row'},
  tab: {flex: 1, alignItems: 'center', justifyContent: 'center'},
});
