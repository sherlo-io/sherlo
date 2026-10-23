import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import PlaySteps from '../PlaySteps/PlaySteps';
import {memberName} from './member';

/**
 * The scene's root: a header naming the signed-in member and today's date, over the tab, list and
 * chat of PlaySteps. Both header values come from what a scene mocks, so the view tree proves the
 * mocks were on.
 */
export default function SceneApp() {
  return (
    <View style={styles.fill}>
      <Text testID="scene.header" style={styles.header}>
        {memberName()} {new Date().toISOString().slice(0, 10)}
      </Text>
      <PlaySteps />
    </View>
  );
}

/** A plain story beside the scene: no mocks, no steps, no ready rule. */
export function Plain() {
  return (
    <View style={[styles.fill, styles.plain]}>
      <Text style={styles.header}>A plain story</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1, alignSelf: 'stretch'},
  plain: {alignItems: 'center', justifyContent: 'center'},
  header: {fontSize: 18, textAlign: 'center', paddingTop: 60, paddingBottom: 8},
});
