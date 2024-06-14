import * as React from 'react';
import Svg, { G, Path, Defs, ClipPath } from 'react-native-svg';
import { CustomSvgProps } from './types';

const SvgComponent = (props: CustomSvgProps) => (
  <Svg width={props.sizePx} height={props.sizePx} viewBox="0 0 28 28" fill="none">
    <G clipPath="url(#a)">
      <Path
        fill="#fff"
        fillOpacity={props.isActive ? 0.7 : 0.3}
        d="M10.687 14.025h15.399v2.53h-15.4l6.787 6.787-1.79 1.789-9.84-9.84 9.84-9.84 1.79 1.788-6.786 6.786Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.781.109h30.363v30.363H.781z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;
