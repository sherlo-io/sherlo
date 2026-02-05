import React from 'react';
import { ScrollView, Text, View, StyleSheet, Animated, TouchableOpacity, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ============================================
// Floating Header (with gap from top)
// ============================================
const FloatingHeaderComponent = () => {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: 100 }]}>
        <Text style={styles.header}>Content Under Floating Header</Text>
        
        {Array.from({ length: 25 }).map((_, i) => (
          <View key={i} style={[styles.item, { backgroundColor: i % 2 === 0 ? '#e8f5e9' : '#f1f8e9' }]}>
            <Text style={styles.itemTitle}>Item{i + 1}</Text>
            <Text style={styles.itemText}>
              This content scrolls behind the floating header. The header stays visible 
              at all times, positioned slightly below the status bar.
            </Text>
          </View>
        ))}
      </ScrollView>
      
      {/* Floating header with gap from top */}
      <View style={floatingStyles.headerContainer}>
        <View style={floatingStyles.header}>
          <Text style={floatingStyles.headerText}>📌 Floating Header</Text>
          <Text style={floatingStyles.headerSubtext}>Pinned 40pt from top</Text>
        </View>
      </View>
    </View>
  );
};

// ============================================
// FAB Button (Floating Action Button at bottom)
// ============================================
const FABComponent = () => {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.header}>Scroll with FAB</Text>
        <Text style={styles.description}>
          A floating action button stays fixed at the bottom right.
          This tests how overlays interact with long screenshots.
        </Text>
        
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={i} style={[styles.item, { backgroundColor: i % 2 === 0 ? '#e3f2fd' : '#e1f5fe' }]}>
            <Text style={styles.itemTitle}>Message {i + 1}</Text>
            <Text style={styles.itemText}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
              Proin vel magna vel est pretium tincidunt.
            </Text>
          </View>
        ))}
      </ScrollView>
      
      {/* Floating Action Button */}
      <TouchableOpacity style={fabStyles.fab} activeOpacity={0.8}>
        <Text style={fabStyles.fabText}>+</Text>
      </TouchableOpacity>
      
      {/* Secondary FAB (smaller, above main) */}
      <TouchableOpacity style={fabStyles.fabSecondary} activeOpacity={0.8}>
        <Text style={fabStyles.fabSecondaryText}>✏️</Text>
      </TouchableOpacity>
    </View>
  );
};

// ============================================
// Collapsing Header
// ============================================
const CollapsingHeaderComponent = () => {
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const headerHeight = 200;
  const minHeaderHeight = 60;
  
  const animatedHeaderHeight = scrollY.interpolate({
    inputRange: [0, headerHeight - minHeaderHeight],
    outputRange: [headerHeight, minHeaderHeight],
    extrapolate: 'clamp',
  });
  
  const animatedOpacity = scrollY.interpolate({
    inputRange: [0, headerHeight - minHeaderHeight],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  
  return (
    <View style={styles.container}>
      {/* Collapsing header */}
      <Animated.View style={[collapsingStyles.header, { height: animatedHeaderHeight }]}>
        <LinearGradient
          colors={['#f857a6', '#ff5858']}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[collapsingStyles.headerContent, { opacity: animatedOpacity }]}>
          <Text style={collapsingStyles.headerTitle}>Collapsing Header</Text>
          <Text style={collapsingStyles.headerSubtitle}>Scroll to collapse</Text>
        </Animated.View>
        <View style={collapsingStyles.headerBar}>
          <Text style={collapsingStyles.headerBarText}>Title</Text>
        </View>
      </Animated.View>
      
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 20 }]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={i} style={[styles.item, { backgroundColor: '#fff5f5' }]}>
            <Text style={styles.itemTitle}>Item{i + 1}</Text>
            <Text style={styles.itemText}>
              Scroll up to see the header collapse. This tests how
              animated elements interact with screenshot stitching.
            </Text>
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
};

// ============================================
// Infinite Scroll (tests MAX_SCROLL_PARTS limit)
// ============================================
const INFINITE_DATA = Array.from({ length: 300 }, (_, i) => ({ id: i, title: `Item${i + 1} of 300` }));

const InfiniteScrollComponent = () => {
  // Uses FlatList for virtualized rendering - only visible items are rendered
  // This should trigger the MAX_SCROLL_PARTS limit and stop capturing
  
  const renderItem = ({ item, index }: { item: typeof INFINITE_DATA[0]; index: number }) => (
    <View 
      style={[
        styles.item, 
        { 
          backgroundColor: `hsl(${(index * 3.6) % 360}, 70%, 90%)`,
          borderLeftWidth: 4,
          borderLeftColor: `hsl(${(index * 3.6) % 360}, 70%, 50%)`,
        }
      ]}
    >
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemText}>
        If you see this, scrolling is still going... 
        The runner should stop at around 20 parts.
      </Text>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={INFINITE_DATA}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      ListHeaderComponent={
        <>
          <Text style={styles.header}>⚠️ Infinite Scroll Test</Text>
          <Text style={[styles.description, { color: '#d32f2f' }]}>
            This story contains 300 items to test scroll limit protection.
            The runner should stop at MAX_SCROLL_PARTS (20) parts.
          </Text>
        </>
      }
      ListFooterComponent={
        <View style={[styles.footer, { backgroundColor: '#d32f2f' }]}>
          <Text style={styles.footerText}>🚫 Should Never Reach Here!</Text>
        </View>
      }
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
};

// ============================================
// Meta & Exports
// ============================================
export default {};

export const FloatingHeader = { render: () => <FloatingHeaderComponent /> };
export const FABButton = { render: () => <FABComponent /> };
export const CollapsingHeader = { render: () => <CollapsingHeaderComponent /> };
export const InfiniteScroll = { render: () => <InfiniteScrollComponent /> };
export const ViewportOnly = { render: () => <InfiniteScrollComponent />, parameters: { sherlo: { takeViewportSnapshot: true } } };

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  description: {
    fontSize: 16,
    marginBottom: 20,
    color: '#666',
    lineHeight: 24,
  },
  item: {
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  itemText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  footerText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

const floatingStyles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  header: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtext: {
    color: '#e8f5e9',
    fontSize: 12,
    marginTop: 4,
  },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
  fabSecondary: {
    position: 'absolute',
    bottom: 110,
    right: 38,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#03A9F4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  fabSecondaryText: {
    fontSize: 20,
  },
});

const collapsingStyles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },
  headerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});

