import React from "react";
import { StyleSheet, View } from "react-native";


//const StorybookDecorator = (centerType: "center" | "bottom) => (Story: React.FC) => {
const StoryDecorator = (Story: React.FC) => (
  <View style={styles.container}>
    <Story />
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: 8,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default StoryDecorator;
