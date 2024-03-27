import React, { ReactElement, ReactNode, useContext } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import SherloContext from '../contexts/SherloContext';

interface AddonPanelProps {
  onPreviewStoryPress: () => void;
}

const generateParamText = (name: string, value: string, description: string): ReactNode => (
  <>
    <Text style={styles.paramNameText}>{`${name}:`}</Text>
    <Text>{`${value}\n`}</Text>
    <Text>{`${description}\n\n`}</Text>
  </>
);

const AddonPanel = ({ onPreviewStoryPress }: AddonPanelProps): ReactElement => {
  const { renderedSnapshot } = useContext(SherloContext);

  const params = renderedSnapshot?.sherloParameters || {};

  return (
    <View style={styles.container}>
      <Button title="Preview" color={'#2E2D45'} onPress={onPreviewStoryPress} />
      <Text style={styles.parametersText}>
        {generateParamText(
          'defocus',
          params.defocus ? 'true' : 'false',
          'Setting defocus to true hides the keyboard and defocuses any focused input before taking the screenshot. This is useful because focused inputs have animated elements that will make screenshots unpredictable when compared to the baseline.'
        )}
        {generateParamText(
          'exclude',
          params.exclude ? 'true' : 'false',
          'Setting exclude to true skips the story during testing. This might be useful if the story has animations that cannot be stabilized for testing or the component behaves in less predictable ways.'
        )}
        {generateParamText(
          'restart',
          params.restart ? 'true' : 'false',
          "Setting restart to true restarts the app after testing this story before resuming testing other stories. This might be helpful if the story alters the view in a way that's persistent for other stories, such as displaying an overlay modal that doesn't hide when changing stories and thus will be always visible in other screenshots."
        )}
        {generateParamText(
          'platform',
          params.platform || 'undefined',
          'Setting platform parameter to either android or ios tests the story only for that specific platform. By default, Sherlo tests all stories on all platforms specified in sherlo.config.json.'
        )}
        {generateParamText(
          'figmaUrl',
          params.figmaUrl || 'undefined',
          'You can supply figmaUrl parameter with an URL to figma frame that contains designs for this specific component. If supplied it can be viewed during review to easily compare the implementation with designs and detect any differences.'
        )}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginVertical: 16,
    marginHorizontal: 16,
  },
  paramNameText: {
    color: '#252435',
  },
  parametersText: {
    marginVertical: 16,
  },
});

export default AddonPanel;
