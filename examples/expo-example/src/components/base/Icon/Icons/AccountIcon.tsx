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
        fillOpacity={0.3}
        d="M25.7 28.413h-2.531v-2.53a3.795 3.795 0 0 0-3.796-3.795h-7.59a3.795 3.795 0 0 0-3.796 3.795v2.53h-2.53v-2.53a6.326 6.326 0 0 1 6.326-6.325h7.59a6.326 6.326 0 0 1 6.326 6.325v2.53ZM15.577 17.027a7.59 7.59 0 1 1 0-15.18 7.59 7.59 0 0 1 0 15.18Zm0-2.53a5.06 5.06 0 1 0 0-10.122 5.06 5.06 0 0 0 0 10.122Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.398.58h30.363v30.364H.398z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
