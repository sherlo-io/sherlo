import React from 'react';
import { Text } from 'react-native';
import { Image } from 'tamagui';

function TamaguiImage({ uri }: TamaguiImageProps) {
  return (
    <>
      <Image
        source={{
          uri,
          width: 200,
          height: 300,
        }}
      />
      <Text>URI: {uri}</Text>
    </>
  );
}

export type TamaguiImageProps = {
  uri: string;
};

export default TamaguiImage;
