import * as React from 'react';
import Svg, { Path } from 'react-native-svg';
import { CustomSvgProps } from './types';
const SvgComponent = (props: CustomSvgProps) => (
  <Svg width={props.sizePx} height={props.sizePx} viewBox="0 0 28 28" fill="none">
    <Path
      fill="#fff"
      fillOpacity={props.isActive ? 0.7 : 0.3}
      d="M12.516 23.247v-9.516H3v-1.215h9.516V3h1.215v9.516h9.516v1.215h-9.516v9.516h-1.215Z"
    />
  </Svg>
);
export default SvgComponent;
