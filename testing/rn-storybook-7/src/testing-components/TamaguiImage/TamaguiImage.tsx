import { Image } from 'tamagui';

function TamaguiImage({ variant }: TamaguiImageProps) {
  return (
    <Image
      source={{
        uri:
          variant === 'url'
            ? 'https://picsum.photos/id/237/200/300'
            : require('./static_example.jpg'),
        width: 200,
        height: 300,
      }}
    />
  );
}

export type TamaguiImageProps = {
  variant: 'url' | 'static';
};

export default TamaguiImage;
