import React from 'react';
import { StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { colors } from '../../../theme/colors';
import { dimensions } from '../../../theme/dimensions';

interface AvatarProps {
  path: ImageSourcePropType;
}

const Avatar = ({ path }: AvatarProps) => {
  return <Image source={path} style={styles.image} />;
};
export default Avatar;

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
    width: dimensions.avatar,
    height: dimensions.avatar,
    borderRadius: 70.304,
    borderWidth: 0.675,
    borderColor: colors.avatarBorder,
    overflow: 'hidden',
  },
});
