import type { Meta } from "@storybook/react";
import Text from "./Text";
import StoryDecorator from "../../../decorators/StoryDecorator";
import { StyleSheet, View } from "react-native";

export default {
  component: Text,
  decorators: [StoryDecorator],
} as Meta<typeof Text>;

const styles = StyleSheet.create({
  marginBottom10: {
    marginBottom: 30,
  },
});

export const Primary = {
  render: () => (
    <View>
      <View style={styles.marginBottom10}>
        <Text variant="headline">headline text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="headlineInactive">headlineInactive text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="subtitle">subtitle text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="tutorialHeadline">tutorialHeadline text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="tutorialSubtitle">tutorialSubtitle text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="tutorialButton">tutorialButton text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="usernameText">usernameText text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="displayBox">displayBox text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="displayBoxValue">displayBoxValue text</Text>
      </View>
      <View style={styles.marginBottom10}>
        <Text variant="time">time text</Text>
      </View>
    </View>
  ),
};
