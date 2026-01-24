import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import type { Meta } from '@storybook/react';

const ScrollableComponent = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Scrollable Story</Text>
      <Text style={styles.description}>
        This story contains a long scroll view to test the isScrollableSnapshot native functionality.
        The content below should extend well beyond the screen height.
      </Text>
      
      {Array.from({ length: 20 }).map((_, i) => (
        <View key={i} style={[styles.item, { backgroundColor: i % 2 === 0 ? '#e0e0e0' : '#f5f5f5' }]}>
          <Text style={styles.itemTitle}>Item {i + 1}</Text>
          <Text style={styles.itemText}>
            This is some filler text for item number {i + 1}. It is here to take up space and ensure
            that the scroll view has enough content to be scrollable on all devices.
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
          </Text>
        </View>
      ))}
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>End of Scroll View</Text>
      </View>
    </ScrollView>
  );
};

export default {
  component: ScrollableComponent,
} as Meta<typeof ScrollableComponent>;

export const Default = {};

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
