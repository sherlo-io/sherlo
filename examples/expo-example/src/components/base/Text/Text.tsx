import React from 'react';
import { Text as TextComponent, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { dimensions } from 'theme/dimensions';

interface TextProps {
  variant:
    | 'headline'
    | 'headlineInactive'
    | 'subtitle'
    | 'tutorialHeadline'
    | 'tutorialSubtitle'
    | 'tutorialButton'
    | 'usernameText'
    | 'displayBox'
    | 'displayBoxValue'
    | 'time';
  children: string;
}

const Text = ({ variant, children }: TextProps) => {
  const textVariantStyle = getTextVariantStyle(variant);

  return <TextComponent style={[textVariantStyle]}>{children}</TextComponent>;
};

const getTextVariantStyle = (variant: string) => {
  switch (variant) {
    case 'headline':
      return styles.headline;
    case 'headlineInactive':
      return styles.headlineInactive;
    case 'subtitle':
      return styles.subtitle;
    case 'tutorialHeadline':
      return styles.tutorialHeadline;
    case 'tutorialSubtitle':
      return styles.tutorialSubtitle;
    case 'tutorialButton':
      return styles.tutorialButton;
    case 'usernameText':
      return styles.usernameText;
    case 'displayBox':
      return styles.displayBox;
    case 'displayBoxValue':
      return styles.displayBoxValue;
    case 'time':
      return styles.time;
    default:
      return {};
  }
};

export default Text;

const styles = StyleSheet.create({
  headline: {
    fontFamily: 'Urbanist_600SemiBold',
    fontSize: dimensions.fontSize4,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
  headlineInactive: {
    fontFamily: 'Urbanist_600SemiBold',
    fontSize: dimensions.fontSize4,
    letterSpacing: 0,
    color: colors.textSubtle,
  },
  subtitle: {
    fontFamily: 'Urbanist_500Medium',
    fontSize: dimensions.fontSize2,
    letterSpacing: 0,
    color: colors.textSubtle,
  },
  tutorialHeadline: {
    fontFamily: 'Urbanist_700Bold',
    fontSize: dimensions.fontSize6,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
  tutorialSubtitle: {
    fontFamily: 'Urbanist_400Regular',
    fontSize: dimensions.fontSize5,
    letterSpacing: 0,
    color: colors.textHighlight,
    textAlign: 'center',
  },
  tutorialButton: {
    fontFamily: 'Urbanist_700Bold',
    fontSize: dimensions.fontSize3,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
  usernameText: {
    fontFamily: 'Urbanist_600SemiBold',
    fontSize: dimensions.fontSize6,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
  displayBox: {
    fontFamily: 'Urbanist_500Medium',
    fontSize: dimensions.fontSize1,
    letterSpacing: 0,
    color: colors.textDisplayBox,
  },
  displayBoxValue: {
    fontFamily: 'Urbanist_700Bold',
    fontSize: dimensions.fontSize2,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
  time: {
    fontFamily: 'Urbanist_500Medium',
    fontSize: dimensions.fontSize2,
    letterSpacing: 0,
    color: colors.textHighlight,
  },
});
