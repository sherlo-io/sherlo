import * as React from "react";
import Svg, { Path } from "react-native-svg";
import { CustomSvgProps } from "./types";
const SvgComponent = (props: CustomSvgProps) => (
  <Svg
    width={props.sizePx}
    height={props.sizePx}
    viewBox="0 0 28 28"
    fill="none"
  >
    <Path
      fill="#fff"
      fillOpacity={0.7}
      d="M12.516 14.215H3V13h20.247v1.215H12.516Z"
    />
  </Svg>
);
export default SvgComponent;
