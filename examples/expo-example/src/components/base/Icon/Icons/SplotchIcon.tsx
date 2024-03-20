import * as React from "react";
import Svg, { G, Path, Defs, ClipPath } from "react-native-svg";
import { CustomSvgProps } from "./types";

const SvgComponent = (props: CustomSvgProps) => (
  <Svg
    width={props.sizePx}
    height={props.sizePx}
    viewBox="0 0 28 28"
    fill="none"
  >
    <G clipPath="url(#a)">
      <Path
        fill="#fff"
        fillOpacity={0.8}
        d="M8.132 2.982a4.78 4.78 0 0 1 4.78 4.78v4.781h-4.78a4.78 4.78 0 0 1 0-9.561Zm2.531 7.311v-2.53a2.531 2.531 0 1 0-2.53 2.53h2.53Zm-2.53 4.5h4.78v4.78a4.78 4.78 0 1 1-4.78-4.78Zm0 2.25a2.53 2.53 0 1 0 2.53 2.53v-2.53h-2.53Zm11.81-14.061a4.78 4.78 0 1 1 0 9.561h-4.78v-4.78a4.78 4.78 0 0 1 4.78-4.781Zm0 7.311a2.53 2.53 0 1 0-2.53-2.53v2.53h2.53Zm-4.78 4.5h4.78a4.78 4.78 0 1 1-4.78 4.78v-4.78Zm2.25 2.25v2.53a2.53 2.53 0 1 0 2.53-2.53h-2.53Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.54.169h26.996v26.997H.54z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
