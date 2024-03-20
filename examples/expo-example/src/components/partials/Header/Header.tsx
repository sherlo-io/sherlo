import React from "react";
import { ImageSourcePropType, StyleSheet, View } from "react-native";
import  Text  from "../../base/Text/Text";
import  AvatarImage  from "../../base/AvatarImage/AvatarImage";

import { dimensions } from "../../../theme/dimensions";
import IconButton from "../../base/IconButton/IconButton";

type HeaderProps = {
  avatarSource: ImageSourcePropType;
  userName?: string;
  title?: string;
  onBackPress?: () => void;
};

 const Header = ({
  avatarSource,
  userName,
  title,
  onBackPress,
}: HeaderProps) => {
  return (
    <View style={[styles.container, !!userName && styles.userName]}>
      {userName && (
        <>
          <Text variant="usernameText">{`Hello, ${userName}`}</Text>
          <AvatarImage path={avatarSource} />
        </>
      )}
      {title && (
        <>
          <IconButton name="arrowLeft" size="big" onPress={onBackPress} />
          <Text variant="headline">{title}</Text>
          <AvatarImage path={avatarSource} />
        </>
      )}
    </View>
  );
};

export default Header

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: {
    marginHorizontal: dimensions.mainHeaderHMargin,
  },
});
