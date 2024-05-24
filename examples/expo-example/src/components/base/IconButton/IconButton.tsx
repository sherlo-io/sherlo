import React from "react";
import { TouchableOpacity } from "react-native";
import Icon, { IconProps } from "../Icon";

interface IconButtonProps extends IconProps {
  onPress?: () => void;
}

const IconButton = ({ name, size, isActive ,onPress }: IconButtonProps) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <Icon name={name} size={size} isActive={isActive}/>
    </TouchableOpacity>
  );
};
export default IconButton;
