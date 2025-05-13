import React from 'react';
import {Image} from 'tamagui';

function TamaguiImage({uri}: TamaguiImageProps) {
  return (
    <Image
      source={{
        uri,
        width: 200,
        height: 300,
      }}
    />
  );
}

export type TamaguiImageProps = {
  uri: string;
};

export default TamaguiImage;
