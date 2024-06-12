import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

let breakpoint: 'M' | 'L';

if (width <= 800) {
  breakpoint = 'M';
} else {
  breakpoint = 'L';
}

// 13.5 16.2 17.5 20.25 21.6 24.3
export const dimensions = {
  breakpoint,
  fontSize1: { M: 13.5, L: 27.0 }[breakpoint],
  fontSize2: { M: 16.2, L: 32.4 }[breakpoint],
  fontSize3: { M: 17.5, L: 35.0 }[breakpoint],
  fontSize4: { M: 20.25, L: 40.5 }[breakpoint],
  fontSize5: { M: 21.6, L: 43.2 }[breakpoint],
  fontSize6: { M: 24.3, L: 48.6 }[breakpoint],

  iconsSizeSmall: { M: 16, L: 32 }[breakpoint],
  iconsSizeMedium: { M: 22, L: 44 }[breakpoint],
  iconsSizeBig: { M: 27, L: 54 }[breakpoint],

  switchWidth: { M: 45, L: 90 }[breakpoint],
  switchHeight: { M: 30, L: 60 }[breakpoint],
  switchBorderWidth: { M: 1.2, L: 2.4 }[breakpoint],
  switchCircleSize: { M: 20.25, L: 40.5 }[breakpoint],
  switchBarHaight: { M: 27, L: 54 }[breakpoint],

  footerHeight: { M: 113, L: 180 }[breakpoint],
  infoDisplayGap: { M: 17, L: 60 }[breakpoint],
  infoDisplayBoxPadding: { M: 14, L: 24 }[breakpoint],
  scrollOverlayHeight: { M: 100, L: 175 }[breakpoint],
  timeBoxPadding: { M: 16, L: 28 }[breakpoint],
  timeBoxGap: { M: 22, L: 38 }[breakpoint],
  settingsButtonPadding: { M: 22, L: 38 }[breakpoint],
  settingsButtonHeight: { M: 63, L: 106 }[breakpoint],
  settingsButtonWidth: { M: 123, L: 246 }[breakpoint],
  cardItemPadding: { M: 22, L: 44 }[breakpoint],
  devicesListItemHeight: { M: 215, L: 442 }[breakpoint],
  devicesListItemWidth: { M: 185, L: 536 }[breakpoint],
  devicesListOffset: { M: 60, L: 120 }[breakpoint],
  roomsListItemHeight: { M: 180, L: 400 }[breakpoint],
  roomsListItemMargin: { M: 8, L: 20 }[breakpoint],
  tabsGap: { M: 31, L: 80 }[breakpoint],
  listItemMargin: { M: 7, L: 14 }[breakpoint],
  deviceListGap: { M: 8, L: 21 }[breakpoint],
  deviceListoffsetBox: { M: 60, L: 120 }[breakpoint],
  mainHeaderHMargin: { M: 32, L: 70 }[breakpoint],
  avatar: { M: 43, L: 86 }[breakpoint],
  controllScreenMargin: { M: 25, L: 45 }[breakpoint],
};
