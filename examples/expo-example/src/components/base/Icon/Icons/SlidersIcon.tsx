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
        fillOpacity={0.7}
        d="M8.76 22.99a3.797 3.797 0 0 1 7.16 0h12.867v2.53H15.92a3.797 3.797 0 0 1-7.161 0H3.484v-2.53H8.76Zm7.59-8.856a3.797 3.797 0 0 1 7.161 0h5.276v2.53H23.51a3.797 3.797 0 0 1-7.16 0H3.484v-2.53h12.867ZM8.76 5.278a3.797 3.797 0 0 1 7.16 0h12.867v2.53H15.92a3.797 3.797 0 0 1-7.161 0H3.484v-2.53H8.76Zm3.58 2.53a1.265 1.265 0 1 0 0-2.53 1.265 1.265 0 0 0 0 2.53Zm7.591 8.857a1.265 1.265 0 1 0 0-2.531 1.265 1.265 0 0 0 0 2.53Zm-7.59 8.855a1.265 1.265 0 1 0 0-2.529 1.265 1.265 0 0 0 0 2.53Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.953.218h30.363V30.58H.953z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
