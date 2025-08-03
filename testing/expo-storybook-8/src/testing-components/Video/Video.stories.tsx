import { StoryDecorator } from '@sherlo/testing-components';
import ReactNativeVideo from 'react-native-video';
import ReactNativeVideoPlayer from 'react-native-video-player';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { Video as ExpoAVVideo, ResizeMode } from 'expo-av';

export default {
  decorators: [StoryDecorator({ placement: 'center' })],
};

const URL = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

export const ReactNativeVideoUrl = {
  render: () => {
    return (
      <ReactNativeVideo
        source={{ uri: URL }}
        controls
        paused={true}
        style={{ width: '100%', aspectRatio: 16 / 9 }}
      />
    );
  },
};

export const ReactNativeVideoPlayerUrl = {
  render: () => {
    return (
      <ReactNativeVideoPlayer
        source={{ uri: URL }}
        autoplay={false}
        videoWidth={1280}
        videoHeight={720}
      />
    );
  },
};

export const VLCMediaPlayerUrl = {
  render: () => (
    <VLCPlayer source={{ uri: URL }} style={{ width: '100%', aspectRatio: 16 / 9 }} paused={true} />
  ),
};

export const ExpoAVVideoUrl = {
  render: () => (
    <ExpoAVVideo
      source={{ uri: URL }}
      useNativeControls
      shouldPlay={false}
      resizeMode={ResizeMode.CONTAIN}
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    />
  ),
};
