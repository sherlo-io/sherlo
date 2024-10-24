import React from 'react';
import { ImageSourcePropType, StyleSheet, View } from 'react-native';
import Text from '../../base/Text/Text';

import { dimensions } from '../../../theme/dimensions';
import IconButton from '../../base/IconButton/IconButton';
import Avatar from 'components/base/Avatar/Avatar';

type HeaderProps = {
  avatarSource: ImageSourcePropType;
  userName?: string;
  title?: string;
  onBackPress?: () => void;
};

const Header = ({ avatarSource, userName, title, onBackPress }: HeaderProps) => {
  return (
    <View style={[styles.container, !!userName && styles.userName]}>
      {userName && (
        <>
          <Text variant="usernameText">{`Hello, ${userName}`}</Text>
          <Avatar path={avatarSource} />
        </>
      )}
      {title && (
        <>
          <IconButton name="arrowLeft" size="big" onPress={onBackPress} isActive={true}/>
          <Text variant="headline">{title}</Text>
          <Avatar path={avatarSource} />
        </>
      )}
    </View>
  );
};

export default Header;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    marginHorizontal: dimensions.mainHeaderHMargin,
  },
});
