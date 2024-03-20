import * as React from "react";
import Svg, { SvgProps, G, Path, Defs, ClipPath } from "react-native-svg";
const SaveEnergy = (props: SvgProps) => (
  <Svg width={116} height={153} fill="none">
    <G fill="#fff" fillOpacity={0.8} clipPath="url(#a)">
      <Path d="M65.33 15.35a1.176 1.176 0 0 0-1.807-1.505l-5.43 6.515c-.58.697-.938 1.121-1.232 1.387a1.198 1.198 0 0 1-.272.198 1.203 1.203 0 0 1-.273-.198c-.295-.266-.652-.69-1.233-1.387l-2.294-2.753a1.176 1.176 0 1 0-1.806 1.505l2.344 2.813c.515.618.979 1.175 1.413 1.567.471.426 1.066.805 1.849.805.782 0 1.377-.38 1.848-.805.434-.392.898-.949 1.413-1.567l5.48-6.575Z" />
      <Path
        fillRule="evenodd"
        d="M63.743 4.81c-1.604-5.62-9.57-5.62-11.174 0a3.459 3.459 0 0 1-4.167 2.407c-5.67-1.421-9.653 5.477-5.587 9.677a3.459 3.459 0 0 1 0 4.812c-4.066 4.2-.083 11.098 5.587 9.677a3.459 3.459 0 0 1 4.167 2.406c1.604 5.62 9.57 5.62 11.174 0a3.459 3.459 0 0 1 4.167-2.406c5.67 1.421 9.653-5.477 5.587-9.677a3.459 3.459 0 0 1 0-4.812c4.066-4.2.083-11.098-5.587-9.677a3.459 3.459 0 0 1-4.167-2.406Zm-8.913.646c.955-3.346 5.697-3.346 6.652 0a5.81 5.81 0 0 0 7 4.041c3.375-.846 5.746 3.261 3.326 5.761a5.81 5.81 0 0 0 0 8.083c2.42 2.5.05 6.607-3.326 5.761a5.81 5.81 0 0 0-7 4.042c-.955 3.346-5.697 3.346-6.652 0a5.81 5.81 0 0 0-7-4.042c-3.375.846-5.747-3.26-3.326-5.76a5.81 5.81 0 0 0 0-8.083c-2.42-2.5-.05-6.608 3.326-5.762a5.81 5.81 0 0 0 7-4.04Z"
        clipRule="evenodd"
      />
    </G>
    <Path
      fill="#fff"
      fillOpacity={0.8}
      d="m14.012 113.739 1.118-.363-1.118.363Zm-5.31-29.488-1.13-.322 1.13.322Zm22.17-22.402.69.951-.69-.95ZM9.244 82.585l1.104.404-1.104-.404Zm19.223 59.161-.656.975.656-.975Zm-1.418-1.03-.725.925.725-.925Zm75.243-26.977-1.118-.363 1.118.363Zm-13.037 26.977.725.925-.725-.925Zm-1.418 1.03.656.975-.656-.975Zm-2.405-79.897.691-.95-.691.95Zm21.627 20.736-1.104.404 1.104-.404Zm.542 1.666 1.131-.322-1.131.322ZM59.028 47.688l-.043 1.175.043-1.175Zm-1.752 0 .043 1.175-.043-1.175Zm19.999 97.54.14 1.167-.14-1.167Zm-38.246 0 .142-1.167-.142 1.167Zm-23.9-31.852c-2.442-7.518-4.244-13.069-5.196-17.615-.946-4.519-1.026-7.935-.1-11.188l-2.26-.644c-1.07 3.754-.93 7.588.06 12.314.983 4.699 2.834 10.39 5.26 17.859l2.237-.726Zm15.052-52.478c-6.354 4.616-11.196 8.132-14.754 11.356-3.579 3.242-5.945 6.262-7.287 9.927l2.208.808c1.163-3.177 3.236-5.893 6.657-8.993 3.443-3.118 8.163-6.55 14.558-11.196l-1.382-1.902ZM9.833 84.573c.153-.534.324-1.063.515-1.584L8.14 82.18c-.21.575-.4 1.159-.568 1.748l2.261.644Zm3.06 29.529c2.428 7.47 4.275 13.161 6.241 17.541 1.978 4.406 4.119 7.589 7.19 9.998l1.45-1.851c-2.661-2.087-4.604-4.897-6.495-9.109-1.902-4.238-3.706-9.787-6.15-17.305l-2.235.726Zm16.23 26.668c-.462-.31-.911-.637-1.349-.98l-1.45 1.851c.482.378.978.738 1.487 1.08l1.312-1.951Zm72.051-27.394c-2.443 7.518-4.248 13.067-6.15 17.305-1.89 4.212-3.833 7.022-6.495 9.109l1.451 1.851c3.071-2.409 5.212-5.592 7.19-9.998 1.965-4.38 3.813-10.071 6.24-17.541l-2.236-.726ZM88.529 139.79a22.7 22.7 0 0 1-1.348.98l1.312 1.951a25.241 25.241 0 0 0 1.487-1.08l-1.45-1.851ZM84.741 62.8c6.395 4.647 11.115 8.078 14.558 11.196 3.421 3.1 5.494 5.817 6.656 8.993l2.208-.808c-1.341-3.665-3.707-6.685-7.286-9.927-3.558-3.224-8.4-6.74-14.754-11.356L84.741 62.8Zm18.669 51.302c2.427-7.469 4.278-13.16 5.262-17.859.989-4.726 1.129-8.56.06-12.314l-2.262.644c.927 3.253.847 6.67-.1 11.188-.952 4.546-2.753 10.097-5.196 17.615l2.236.726Zm2.545-31.113c.191.521.363 1.05.515 1.584l2.262-.644a24.955 24.955 0 0 0-.569-1.748l-2.208.808Zm-19.832-22.09c-6.354-4.617-11.194-8.136-15.36-10.524-4.188-2.401-7.792-3.719-11.692-3.862l-.086 2.35c3.38.124 6.604 1.256 10.61 3.552 4.029 2.31 8.75 5.739 15.146 10.385l1.382-1.902ZM31.563 62.8c6.395-4.646 11.117-8.075 15.146-10.385 4.006-2.296 7.23-3.428 10.61-3.552l-.087-2.35c-3.9.143-7.503 1.46-11.692 3.862-4.165 2.388-9.005 5.907-15.36 10.523l1.383 1.902ZM59.07 46.513a25.054 25.054 0 0 0-1.838 0l.086 2.35c.555-.02 1.11-.02 1.666 0l.086-2.35Zm-.92 100.471c8.212 0 14.382.002 19.265-.589l-.283-2.334c-4.709.57-10.711.572-18.981.572v2.351Zm19.265-.589c4.486-.544 7.986-1.597 11.077-3.674l-1.312-1.951c-2.679 1.8-5.782 2.774-10.048 3.291l.283 2.334Zm-19.264-1.762c-8.27 0-14.272-.002-18.981-.572l-.283 2.334c4.883.591 11.053.589 19.264.589v-2.351Zm-18.981-.572c-4.266-.517-7.37-1.491-10.048-3.291l-1.312 1.951c3.09 2.077 6.591 3.13 11.077 3.674l.283-2.334Z"
    />
    <Path
      stroke="#fff"
      strokeLinecap="round"
      strokeOpacity={0.8}
      strokeWidth={2.351}
      d="M40.519 126.279v7.053M49.926 98.065v35.267M59.328 88.66v44.672M68.734 98.065v35.267M78.136 93.832v39.5"
    />
    <Defs>
      <ClipPath id="a">
        <Path fill="#fff" d="M39.344.49h37.62v37.62h-37.62z" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default SaveEnergy;
