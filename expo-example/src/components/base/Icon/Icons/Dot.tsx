import * as React from "react";
import Svg, { Circle } from "react-native-svg";

interface Props {
  fill: boolean;
}

export const Dot = ({ fill }: Props) => (
  <Svg width={15} height={15} fill="none">
    <Circle
      cx={7.355}
      cy={7.583}
      r={5.75}
      fill={fill ? "#fff" : "none"}
      fillOpacity={0.8}
    />
    <Circle
      cx={7.355}
      cy={7.583}
      r={6.509}
      stroke="#fff"
      strokeOpacity={0.8}
      strokeWidth={1.518}
    />
  </Svg>
);
