import * as React from "react";
import Svg, { G, Path, Defs, ClipPath } from "react-native-svg";
import { CustomSvgProps } from "./types";

const SvgComponent = (props: CustomSvgProps) => (
  <Svg
    width={props.sizePx}
    height={props.sizePx}
    viewBox="0 0 23 23"
    fill="none"
  >
    <G clipPath="url(#a)">
      <Path
        fill="#fff"
        fillOpacity={0.8}
        d="m16.655 11.73-5.429-5.428 1.431-1.431 7.873 7.872-7.873 7.872-1.43-1.431 5.428-5.43H4.335v-2.023h12.32Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.29.597h24.29v24.29H.29z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
