import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

let breakpoint: 'M' | 'L';

if (width <= 800) {
  breakpoint = 'M';
} else {
  breakpoint = 'L';
}
export const dimensions = {
  breakpoint,
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
