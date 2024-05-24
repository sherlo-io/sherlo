import * as React from 'react';
import Svg, { G, Path, Defs, ClipPath } from 'react-native-svg';
import { CustomSvgProps } from './types';
const SvgComponent = (props: CustomSvgProps) => (
  <Svg width={props.sizePx} height={props.sizePx} viewBox="0 0 20 20" fill="none">
    <G clipPath="url(#a)">
      <Path
        fill="#fff"
        fillOpacity={props.isActive ? 0.7 : 0.3}
        d="M8.457 11.065 5.594 8.202l.955-.955 1.908 1.91 1.91-1.91.954.955-2.864 2.863Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.36.941h16.197V17.14H.36z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
