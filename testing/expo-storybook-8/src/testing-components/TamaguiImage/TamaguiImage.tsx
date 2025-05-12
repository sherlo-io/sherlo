import { Image } from 'tamagui';

function TamaguiImage() {
  return (
    <Image
      source={{
        uri: 'https://picsum.photos/id/237/200/300',
        width: 200,
        height: 300,
      }}
    />
  );
}

export default TamaguiImage;
