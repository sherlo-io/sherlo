import React from "react";
import { TouchableOpacity } from "react-native";
import Icon, { IconProps } from "../Icon";

interface IconButtonProps extends IconProps {
  onPress?: () => void;
}

const IconButton = ({ name, size, onPress }: IconButtonProps) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <Icon name={name} size={size} />
    </TouchableOpacity>
  );
};
export default IconButton;
