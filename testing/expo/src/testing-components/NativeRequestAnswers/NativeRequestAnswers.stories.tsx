// A picture fetched natively meets the story's request rule.
import type { Meta } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { mockRequest } from '@sherlo/react-native-storybook';
import StoryDecorator from '../../shared/StoryDecorator';
import { FAKE_PHOTO_BASE64 } from './fakePhoto';

// Real pictures: a photo on screen means the request slipped past the rule; magenta over lime
// means the rule answered it.
const DOWNLOADED_URL = 'https://picsum.photos/id/1025/200/300';
const EXPO_IMAGE_URL = 'https://picsum.photos/id/1074/200/300';

const photoRule = mockRequest(
  { url: 'https://picsum.photos/*' },
  { headers: { 'content-type': 'image/png' }, bodyBase64: FAKE_PHOTO_BASE64 }
);

export default {
  title: 'NativeRequestAnswers',
  decorators: [StoryDecorator({ placement: 'center' })],
  parameters: { sherlo: { mocks: [photoRule] } },
} as Meta;

/** react-native-blob-util downloads the picture to a file natively; the file is then drawn. */
function DownloadedToFile() {
  const [path, setPath] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    ReactNativeBlobUtil.config({ fileCache: true, appendExt: 'png' })
      .fetch('GET', DOWNLOADED_URL)
      .then((response) => setPath(response.path()))
      .catch((failure) => setError(String(failure)));
  }, []);

  return (
    <View style={{ alignItems: 'center' }}>
      <Text testID="blob-label">blob-util: {error ?? (path ? 'downloaded' : 'loading')}</Text>
      {path && (
        <Image
          source={{ uri: Platform.OS === 'android' ? `file://${path}` : path }}
          style={{ width: 120, height: 180 }}
        />
      )}
    </View>
  );
}

function ExpoImagePicture() {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text>expo-image</Text>
      <ExpoImage
        source={{ uri: EXPO_IMAGE_URL }}
        style={{ width: 120, height: 180 }}
        cachePolicy="none"
      />
    </View>
  );
}

export const BlobUtilDownload = { render: () => <DownloadedToFile /> };

export const ExpoImageDownload = { render: () => <ExpoImagePicture /> };

export const Both = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <DownloadedToFile />
      <ExpoImagePicture />
    </View>
  ),
};
