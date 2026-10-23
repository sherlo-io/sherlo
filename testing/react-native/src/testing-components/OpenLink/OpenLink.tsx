import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  NavigationContainer,
  StackRouter,
  createNavigatorFactory,
  useNavigation,
  useNavigationBuilder,
  useRoute,
} from '@react-navigation/native';

/**
 * A tiny app with its own navigation and its own linking (the test app had none): Home, and a
 * ChatStack holding ChatList and Chat. The navigator only draws the focused screen, and is plain
 * JavaScript so the app needs no native module for it. Links: sherloplay://home,
 * sherloplay://chat-list, sherloplay://chat/<name>.
 */
function SimpleNavigator(props: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, props);
  return (
    <NavigationContent>
      <View style={styles.fill}>{descriptors[state.routes[state.index].key].render()}</View>
    </NavigationContent>
  );
}
const createSimpleNavigator = createNavigatorFactory(SimpleNavigator);

const RootStack = createSimpleNavigator();
const ChatStack = createSimpleNavigator();

const NAMES = ['Ada', 'Bo', 'Cy'];

function Home() {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.fill}>
      <Text style={styles.title}>Discover</Text>
      <Pressable
        testID="tab.list"
        style={styles.tab}
        onPress={() => navigation.navigate('ChatStack', { screen: 'ChatList' })}
      >
        <Text>Connections</Text>
      </Pressable>
    </View>
  );
}

function ChatList() {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.fill}>
      {NAMES.map((name) => (
        <TouchableOpacity
          key={name}
          testID="row"
          style={styles.row}
          onPress={() => navigation.navigate('Chat', { name })}
        >
          <Text style={styles.rowText}>{name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Chat() {
  const { params } = useRoute<any>();
  return (
    <View style={[styles.fill, styles.chat]}>
      <Text testID="chat.title" style={styles.title}>
        Chat with {params?.name}
      </Text>
    </View>
  );
}

function ChatStackScreens() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen name="ChatList" component={ChatList} />
      <ChatStack.Screen name="Chat" component={Chat} />
    </ChatStack.Navigator>
  );
}

const linking = {
  prefixes: ['sherloplay://'],
  config: {
    screens: {
      Home: 'home',
      ChatStack: { screens: { ChatList: 'chat-list', Chat: 'chat/:name' } },
    },
  },
};

export default function OpenLink() {
  return (
    <NavigationContainer linking={linking}>
      <RootStack.Navigator>
        <RootStack.Screen name="Home" component={Home} />
        <RootStack.Screen name="ChatStack" component={ChatStackScreens} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: 'stretch' },
  chat: { backgroundColor: '#d8f0ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, textAlign: 'center', marginTop: 40 },
  row: { padding: 24, borderBottomWidth: 1, borderColor: '#ccc' },
  rowText: { fontSize: 20 },
  tab: {
    height: 80,
    borderTopWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
