import React, { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../theme/colors';
import { dimensions } from '../../../theme/dimensions';
import { shadows } from '../../../theme/shadows';
import { ImageKeys, getImageSource } from './CardItem.data';

export interface CardItemProps {
  imageKey: ImageKeys;
  withDimmedHeader: boolean;
  children?: ReactNode;
}

const CardItem = ({ imageKey, withDimmedHeader = true, children }: CardItemProps) => {
  const gradient = withDimmedHeader ? 0.15 : -0.2;
  return (
    <View style={[styles.container, shadows.black]}>
      <View style={styles.imageContainer}>
        <Image source={getImageSource(imageKey)} style={styles.image} />
      </View>
      <LinearGradient
        // Top - Bottom
        colors={colors.cardItemGradient}
        start={{ x: 0, y: gradient }}
        end={{ x: 0, y: 1.3 }}
        style={styles.gradientBorder}
      />
      <LinearGradient
        // Left-Right
        colors={colors.cardItemGradient}
        start={{ x: 0.4, y: 0 }}
        end={{ x: 0.6, y: 0 }}
        style={styles.gradient}
      />
      <View style={styles.childrenContainer}>{children}</View>
    </View>
  );
};

export default CardItem;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 18.218,
    borderWidth: 0.675,
    borderColor: colors.cardItemBorder,
  },
  imageContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 18.218,
  },

  gradient: {
    borderRadius: 18.218,
    ...StyleSheet.absoluteFillObject,
  },
  gradientBorder: {
    borderRadius: 18.218,
    position: 'absolute',
    right: -1,
    left: -1,
    top: -1,
    bottom: 0,
  },
  image: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
    borderRadius: 18.218,
  },
  childrenContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: dimensions.cardItemPadding,
    justifyContent: 'space-between',
  },
});
