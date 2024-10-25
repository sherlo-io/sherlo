import React from 'react';
import ArrowRightIcon from './Icons/ArrowRightIcon';
import ArrowLeftIcon from './Icons/ArrowLeftIcon';
import ArrowDownIcon from './Icons/ArrowDownIcon';
import CogIcon from './Icons/CogIcon';
import AccountIcon from './Icons/AccountIcon';
import SlidersIcon from './Icons/SlidersIcon';
import PlusBoxIcon from './Icons/PlusBoxIcon';
import SplotchIcon from './Icons/SplotchIcon';
import PlusIcon from './Icons/PlusIcon';
import MinusIcon from './Icons/MinusIcon';
import { dimensions } from 'theme/dimensions';

export interface IconProps {
  name:
    | 'arrowRight'
    | 'arrowLeft'
    | 'arrowDown'
    | 'cog'
    | 'account'
    | 'sliders'
    | 'plusBox'
    | 'splotch'
    | 'plus'
    | 'minus';
  size: 'small' | 'medium' | 'big';
  isActive: boolean;
}
const Icon = ({ name, size, isActive }: IconProps) => {
  let IconComponent;
  let sizePx;

  switch (size) {
    case 'small':
      sizePx = dimensions.iconsSizeSmall;
      break;
    case 'medium':
      sizePx = dimensions.iconsSizeMedium;
      break;
    case 'big':
      sizePx = dimensions.iconsSizeBig;
      break;
  }

  switch (name) {
    case 'arrowRight':
      IconComponent = ArrowRightIcon;
      break;
    case 'arrowLeft':
      IconComponent = ArrowLeftIcon;
      break;
    case 'arrowDown':
      IconComponent = ArrowDownIcon;
      break;
    case 'cog':
      IconComponent = CogIcon;
      break;
    case 'account':
      IconComponent = AccountIcon;
      break;
    case 'sliders':
      IconComponent = SlidersIcon;
      break;
    case 'plusBox':
      IconComponent = PlusBoxIcon;
      break;
    case 'splotch':
      IconComponent = SplotchIcon;
      break;
    case 'plus':
      IconComponent = PlusIcon;
      break;
    case 'minus':
      IconComponent = MinusIcon;
      break;
    default:
      throw new Error(`invalid icon name: ${name}`);
  }

  return <IconComponent sizePx={sizePx} isActive={isActive} />;
};
export default Icon;
