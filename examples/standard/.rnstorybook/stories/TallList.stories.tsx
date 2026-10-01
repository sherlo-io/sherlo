import type { Meta } from '@storybook/react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// A screen taller than the phone: Sherlo scrolls it and takes a long screenshot.
const TallList = () => (
  <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <Text style={styles.heading}>A tall list</Text>
    {Array.from({ length: 30 }, (_, index) => (
      <View key={index} style={[styles.row, index % 2 === 0 ? styles.even : styles.odd]}>
        <Text style={styles.title}>Row {index + 1}</Text>
        <Text style={styles.text}>Each row is the same height, so every scroll lands on a row.</Text>
      </View>
    ))}
  </ScrollView>
);

export default {
  title: 'Example/TallList',
  component: TallList,
} as Meta<typeof TallList>;

export const Default = {};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  row: {
    height: 72,
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  even: {
    backgroundColor: '#e3f2fd',
  },
  odd: {
    backgroundColor: '#f1f8e9',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  text: {
    fontSize: 13,
    color: '#555',
  },
});
