import * as React from 'react';
import Svg, { G, Path, Defs, ClipPath } from 'react-native-svg';
import { CustomSvgProps } from './types';

const SvgComponent = (props: CustomSvgProps) => (
  <Svg width={props.sizePx} height={props.sizePx} viewBox="0 0 28 28" fill="none">
    <G clipPath="url(#a)">
      <Path
        fill="#fff"
        fillOpacity={props.isActive ? 0.7 : 0.3}
        d="M4.976 22.087a12.674 12.674 0 0 1-1.238-2.942 3.796 3.796 0 0 0 .003-6.765 12.639 12.639 0 0 1 3.164-5.487 3.795 3.795 0 0 0 5.859-3.383 12.638 12.638 0 0 1 6.334.003 3.795 3.795 0 0 0 5.86 3.38 12.64 12.64 0 0 1 1.93 2.543c.547.948.957 1.936 1.237 2.943a3.795 3.795 0 0 0-.003 6.765 12.637 12.637 0 0 1-3.164 5.486 3.795 3.795 0 0 0-5.859 3.383 12.639 12.639 0 0 1-6.334-.002 3.795 3.795 0 0 0-5.86-3.38 12.672 12.672 0 0 1-1.93-2.544Zm7.16.248a6.317 6.317 0 0 1 2.847 3.505c.631.06 1.265.06 1.896.001a6.317 6.317 0 0 1 2.848-3.504 6.317 6.317 0 0 1 4.46-.715 10.03 10.03 0 0 0 .946-1.642 6.317 6.317 0 0 1-1.61-4.218c0-1.594.594-3.083 1.61-4.218a10.277 10.277 0 0 0-.949-1.642 6.317 6.317 0 0 1-4.457-.714 6.317 6.317 0 0 1-2.847-3.504c-.63-.06-1.265-.06-1.896-.001a6.317 6.317 0 0 1-2.848 3.504 6.317 6.317 0 0 1-4.46.715 10.11 10.11 0 0 0-.946 1.642 6.317 6.317 0 0 1 1.61 4.218 6.313 6.313 0 0 1-1.61 4.218c.265.575.583 1.125.95 1.642a6.317 6.317 0 0 1 4.456.713Zm3.796-2.778a3.796 3.796 0 1 1 0-7.591 3.796 3.796 0 0 1 0 7.591Zm0-2.53a1.265 1.265 0 1 0 0-2.53 1.265 1.265 0 0 0 0 2.53Z"
      />
    </G>
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M.75.58h30.363v30.364H.75z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SvgComponent;