import * as React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { CustomSvgProps } from './types';

const SvgComponent = (props: CustomSvgProps) => (
  <Svg width={props.sizePx} height={props.sizePx} viewBox="0 0 28 28" fill="none">
    <Path
      fill="#fff"
      fillOpacity={props.isActive ? 0.7 : 0.3}
      fillRule="evenodd"
      d="M17.02 14.497V10.7h-2.53v3.796h-3.795v2.53h3.796v3.795h2.53v-3.795h3.795v-2.53h-3.795Z"
      clipRule="evenodd"
    />
    <Rect
      width={22.772}
      height={22.772}
      x={4.371}
      y={4.376}
      stroke="#fff"
      strokeOpacity={props.isActive ? 0.7 : 0.3}
      strokeWidth={2.53}
      rx={7.591}
    />
  </Svg>
);
export default SvgComponent;
