import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';

interface StoryDecoratorProps {
  items: React.ReactNode[];
  columns: number;
}

const GridDecorator: React.FC<StoryDecoratorProps> = ({ items, columns }) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemContainer: {
      width: `${100 / columns}%`,
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.grid}>
        {items.map((item, index) => (
          <View key={index} style={styles.itemContainer}>
            {item}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
};

export default GridDecorator;
